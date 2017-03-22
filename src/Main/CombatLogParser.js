import Combatant from './Combatant';

// Talents
export const SPELL_ID_RULE_OF_LAW = 214202;
const BEACON_OF_FAITH_SPELL_ID = 156910;
const BEACON_OF_THE_LIGHTBRINGER_SPELL_ID = 197446;
const BEACON_OF_VIRTUE_SPELL_ID = 200025;

const LEGENDARY_ILTERENDI_BUFF_SPELL_ID = 207589;
const LEGENDARY_ILTERENDI_HEALING_INCREASE = 0.2;

const HOLY_SHOCK_SPELL_ID = 25914;
const LIGHT_OF_DAWN_SPELL_ID = 225311;
const HOLY_LIGHT_SPELL_ID = 82326;
const FLASH_OF_LIGHT_SPELL_ID = 19750;
const LIGHT_OF_THE_MARTYR_SPELL_ID = 183998;
const HOLY_PRISM_SPELL_ID = 114852;
const LIGHTS_HAMMER_SPELL_ID = 119952;
const TYRS_DELIVERANCE_SPELL_ID = 200654;
const BESTOW_FAITH_SPELL_ID = 223306;
const JUDGMENT_OF_LIGHT_SPELL_ID = 183811;
const AURA_OF_MERCY_SPELL_ID = 210291;
const LEECH_SPELL_ID = 143924;

// All beacons use this spell id for their healing events.
const BEACON_TRANSFER_SPELL_ID = 53652;

const ABILITIES_AFFECTED_BY_MASTERY = [
  HOLY_SHOCK_SPELL_ID,
  LIGHT_OF_DAWN_SPELL_ID,
  HOLY_LIGHT_SPELL_ID,
  FLASH_OF_LIGHT_SPELL_ID,
  LIGHT_OF_THE_MARTYR_SPELL_ID,
  HOLY_PRISM_SPELL_ID,
  LIGHTS_HAMMER_SPELL_ID,
  JUDGMENT_OF_LIGHT_SPELL_ID,
  TYRS_DELIVERANCE_SPELL_ID,
  BESTOW_FAITH_SPELL_ID,
];
const ABILITIES_AFFECTED_BY_HEALING_INCREASES = [
  HOLY_SHOCK_SPELL_ID,
  LIGHT_OF_DAWN_SPELL_ID,
  FLASH_OF_LIGHT_SPELL_ID,
  HOLY_SHOCK_SPELL_ID,
  JUDGMENT_OF_LIGHT_SPELL_ID,
  LIGHT_OF_THE_MARTYR_SPELL_ID,
  TYRS_DELIVERANCE_SPELL_ID,
  LIGHTS_HAMMER_SPELL_ID,
  HOLY_PRISM_SPELL_ID,
  AURA_OF_MERCY_SPELL_ID,
  // While the following spells don't double dip in healing increases, they gain the same percentual bonus from the transfer
  BEACON_TRANSFER_SPELL_ID,
  LEECH_SPELL_ID,
];
const BEACON_TRANSFERING_ABILITIES = {
  [HOLY_SHOCK_SPELL_ID]: 1,
  [LIGHT_OF_DAWN_SPELL_ID]: 0.5,
  [HOLY_LIGHT_SPELL_ID]: 1,
  [FLASH_OF_LIGHT_SPELL_ID]: 1,
  [HOLY_PRISM_SPELL_ID]: 0.5,
  [LIGHTS_HAMMER_SPELL_ID]: 0.5,
  [TYRS_DELIVERANCE_SPELL_ID]: 1,
  [BESTOW_FAITH_SPELL_ID]: 1,
};

const BEACON_TYPES = {
  BEACON_OF_FATH: BEACON_OF_FAITH_SPELL_ID,
  BEACON_OF_THE_LIGHTBRINGER: BEACON_OF_THE_LIGHTBRINGER_SPELL_ID,
  BEACON_OF_VIRTUE: BEACON_OF_VIRTUE_SPELL_ID,
};
const TRAITS = {
  SHOCK_TREATMENT: 200315,
};
const DRAPE_OF_SHAME_CRIT_EFFECT = 0.1;
const HIT_TYPES = {
  NORMAL: 1,
  CRIT: 2,
  NOCLUEWHATTHISIS: 3, // seen at Aura of Sacrifice
};

class CombatLogParser {
  lastCast = null;
  // Tracking total healing seen as a sanity check
  totalHealing = 0;

  players = {};
  masteryHealEvents = [];
  ilterendiHealing = 0;
  drapeHealing = 0;

  player = null;
  fight = null;

  get fightDuration() {
    return this.fight.end_time - this.fight.start_time;
  }
  _timestamp = null;
  get currentTimestamp() {
    return this._timestamp;
  }

  constructor(player, fight) {
    this.player = player;
    this.fight = fight;
  }

  parseEvents(events) {
    return new Promise((resolve, reject) => {
      events.forEach(event => {
        this._timestamp = event.timestamp;

        const methodName = `parse_${event.type}`;
        const method = this[methodName];
        if (method) {
          method.call(this, event);
        } else {
          // Report unrecognized events
          // console.warn("Didn't recognize", event.type, event.ability && event.ability.name, event);
        }
      });

      resolve(events.length);
    });
  }

  parse_cast(event) {
    if (this.byPlayer(event)) {
      this.updatePlayerPosition(event);
    }
  }
  parse_damage(event) {
    if (this.toPlayer(event)) {
      // Damage coordinates are for the target, so they are only accurate when done TO player
      this.updatePlayerPosition(event);
    }
  }
  parse_energize(event) {
    if (this.toPlayer(event)) {
      this.updatePlayerPosition(event);
    }
  }
  parse_heal(event) {
    if (this.toPlayer(event)) {
      // Do this before checking if this was done by player so that self-heals will apply full mastery properly
      this.updatePlayerPosition(event);
    }
    if (this.byPlayer(event)) {
      this.processForMasteryEffectiveness(event);
      this.processForDrapeOfShameHealing(event);
      this.processForBeaconHealing(event);
      this.processForIlterendiHealing(event);

      // event.amount is the actual heal as shown in the log
      this.totalHealing += event.amount;
    }
  }
  parse_combatantinfo(event) {
    console.log('combatantinfo', event);

    this.players[event.sourceID] = event;

    if (this.byPlayer(event)) {
      this.selectedCombatant = new Combatant(event);

      event.auras.forEach(aura => {
        this.applyActiveBuff({
          ability: {
            abilityIcon: aura.icon,
            guid: aura.ability,
          },
          sourceID: aura.source,
        });
      });
    }
  }
  parse_absorbed(event) {
    if (this.byPlayer(event)) {
      this.totalHealing += event.amount;
    }
  }
  // TODO: Damage taken from LOTM

  processForMasteryEffectiveness(event) {
    if (!this.lastCast) {
      console.error('Received a heal before we detected a cast. Can\'t process since player location is still unknown.', event);
      return;
    } else if (this.selectedCombatant === null) {
      console.error('Received a heal before selected combatant meta data was received.', event);
      return;
    }
    const isAbilityAffectedByMastery = ABILITIES_AFFECTED_BY_MASTERY.indexOf(event.ability.guid) !== -1;

    const healingDone = event.amount;

    if (isAbilityAffectedByMastery) {
      // console.log(event.ability.name,
      //   `healing:${event.amount},distance:${distance},isRuleOfLawActive:${isRuleOfLawActive},masteryEffectiveness:${masteryEffectiveness}`,
      //   `playerMasteryPerc:${this.playerMasteryPerc}`, event);

      const distance = CombatLogParser.calculateDistance(this.lastCast.x, this.lastCast.y, event.x, event.y) / 100;
      const isRuleOfLawActive = this.hasBuff(SPELL_ID_RULE_OF_LAW);
      // We calculate the mastery effectiveness of this *one* heal
      const masteryEffectiveness = CombatLogParser.calculateMasteryEffectiveness(distance, isRuleOfLawActive);

      // The base healing of the spell (excluding any healing added by mastery)
      const baseHealingDone = healingDone / (1 + this.selectedCombatant.masteryPercentage * masteryEffectiveness);
      const masteryHealingDone = healingDone - baseHealingDone;
      // The max potential mastery healing if we had a mastery effectiveness of 100% on this spell. This does NOT include the base healing
      // Example: a heal that did 1,324 healing with 32.4% mastery with 100% mastery effectiveness will have a max potential mastery healing of 324.
      const maxPotentialMasteryHealing = baseHealingDone * this.selectedCombatant.masteryPercentage; // * 100% mastery effectiveness

      this.masteryHealEvents.push({
        ...event,
        distance,
        masteryEffectiveness,
        baseHealingDone,
        masteryHealingDone,
        maxPotentialMasteryHealing,
      });
    }
  }
  beaconTransferEnabledHealsBacklog = [];
  processForBeaconHealing(event) {
    const spellId = event.ability.guid;
    if (spellId === BEACON_TRANSFER_SPELL_ID) {
      this.processBeaconHealing(event);
    }
    const beaconTransferFactor = BEACON_TRANSFERING_ABILITIES[spellId];
    if (!beaconTransferFactor) {
      return;
    }

    const remainingBeaconTransfers = this.beaconType === BEACON_TYPES.BEACON_OF_FATH ? 2 : 1;
    // TODO: Check if the target of this event had a beacon, in that case reduce remainingBeaconTransfers by 1

    this.beaconTransferEnabledHealsBacklog.push({
      ...event,
      beaconTransferFactor,
      remainingBeaconTransfers,
    });
  }
  processBeaconHealing(beaconTransferEvent) {
    // This should make it near impossible to match the wrong spells as we usually don't cast multiple heals within 500ms while the beacon transfer usually happens within 100ms
    this.beaconTransferEnabledHealsBacklog = this.beaconTransferEnabledHealsBacklog.filter(healEvent => (this.currentTimestamp - healEvent.timestamp) < 500);

    const beaconTransferAmount = beaconTransferEvent.amount;
    const beaconTransferAbsorbed = beaconTransferEvent.absorbed || 0;
    const beaconTransferOverheal = beaconTransferEvent.overheal || 0;
    const beaconTransferRaw = beaconTransferAmount + beaconTransferAbsorbed + beaconTransferOverheal;
    const index = this.beaconTransferEnabledHealsBacklog.findIndex((healEvent) => {
      const amount = healEvent.amount;
      const absorbed = healEvent.absorbed || 0;
      const overheal = healEvent.overheal || 0;
      const raw = amount + absorbed + overheal;
      const expectedBeaconTransfer = Math.round(raw * this.beaconTransferFactor * healEvent.beaconTransferFactor);

      return Math.abs(expectedBeaconTransfer - beaconTransferRaw) <= 1; // allow for rounding errors on Blizzard's end
    });

    const hasMatch = index !== -1;
    if (!hasMatch) {
      // Here's a fun fact for you. Fury Warriors with the legendary "Kazzalax, Fujieda's Fury" (http://www.wowhead.com/item=137053/kazzalax-fujiedas-fury)
      // get a 8% healing received increase for almost the entire fight (tooltip states it's 1%, this is a tooltip bug). What's messed up
      // is that this healing increase doesn't beacon transfer. So we won't be able to recognize the heal in here since it's off by 8%, so
      // this will be triggered. While I could implement code to track it, I chose not to because things would get way more complicated and
      // fragile and the accuracy loss for not including this kind of healing is minimal. I expect other healing received increases likely
      // also don't beacon transfer, but right now this isn't common. Fury warrior log:
      // https://www.warcraftlogs.com/reports/TLQ14HfhjRvNrV2y/#view=events&type=healing&source=10&start=7614145&end=7615174&fight=39
      console.error('Failed to match', beaconTransferEvent, 'to a heal. Healing backlog:', this.beaconTransferEnabledHealsBacklog);
    } else {
      const matchedHeal = this.beaconTransferEnabledHealsBacklog[index];
      // console.log('Matched beacon transfer', beaconTransferEvent, 'to heal', matchedHeal);
      this.processBeaconHealingForDrapeOfShameHealing(beaconTransferEvent, matchedHeal);

      matchedHeal.remainingBeaconTransfers -= 1;
      if (matchedHeal.remainingBeaconTransfers < 1) {
        this.beaconTransferEnabledHealsBacklog.splice(index, 1);
      }
    }
  }
  get beaconType() {
    return this.selectedCombatant.lv100Talent;
  }
  get beaconTransferFactor() {
    return this.beaconType === BEACON_TYPES.BEACON_OF_FATH ? 0.32 : 0.4;
  }
  processForDrapeOfShameHealing(event) {
    const spellId = event.ability.guid;
    if (ABILITIES_AFFECTED_BY_HEALING_INCREASES.indexOf(spellId) === -1 || spellId === BEACON_TRANSFER_SPELL_ID) {
      return;
    }
    if (event.hitType !== HIT_TYPES.CRIT) {
      return;
    }

    const amount = event.amount;
    const absorbed = event.absorbed || 0;
    const overheal = event.overheal || 0;
    const raw = amount + absorbed + overheal;
    const rawNormalPart = raw / this.getCritHealingBonus(event);
    const rawDrapeHealing = rawNormalPart * DRAPE_OF_SHAME_CRIT_EFFECT;

    const effectiveHealing = Math.max(0, rawDrapeHealing - overheal);

    this.drapeHealing += effectiveHealing;
  }
  processBeaconHealingForDrapeOfShameHealing(beaconTransferEvent, healEvent) {
    const spellId = healEvent.ability.guid;
    if (ABILITIES_AFFECTED_BY_HEALING_INCREASES.indexOf(spellId) === -1 || spellId === BEACON_TRANSFER_SPELL_ID) {
      return;
    }
    if (healEvent.hitType !== HIT_TYPES.CRIT) {
      return;
    }

    const amount = beaconTransferEvent.amount;
    const absorbed = beaconTransferEvent.absorbed || 0;
    const overheal = beaconTransferEvent.overheal || 0;
    const raw = amount + absorbed + overheal;
    const rawNormalPart = raw / this.getCritHealingBonus(healEvent);
    const rawDrapeHealing = rawNormalPart * DRAPE_OF_SHAME_CRIT_EFFECT;

    const effectiveHealing = Math.max(0, rawDrapeHealing - overheal);

    this.drapeHealing += effectiveHealing;
  }
  getCritHealingBonus(event) {
    let critModifier = 2 + DRAPE_OF_SHAME_CRIT_EFFECT;
    if (event.ability.guid === HOLY_SHOCK_SPELL_ID) {
      const shockTreatmentTraits = this.selectedCombatant.traitsBySpellId[TRAITS.SHOCK_TREATMENT];
      // Shock Treatment increases critical healing of Holy Shock by 8%: http://www.wowhead.com/spell=200315/shock-treatment
      // This critical healing works on both the regular part and the critical part (unlike Drape of Shame), so we double it.
      critModifier += shockTreatmentTraits * 0.08 * 2;
    }
    return critModifier;
  }
  processForIlterendiHealing(event) {
    const spellId = event.ability.guid;
    if (ABILITIES_AFFECTED_BY_HEALING_INCREASES.indexOf(spellId) === -1) {
      return;
    }
    if (!this.hasBuff(LEGENDARY_ILTERENDI_BUFF_SPELL_ID)) {
      return;
    }

    const amount = event.amount;
    const absorbed = event.absorbed || 0;
    const overheal = event.overheal || 0;
    const raw = amount + absorbed + overheal;
    const ilterendiFactor = 1 + LEGENDARY_ILTERENDI_HEALING_INCREASE;
    const ilterendiHealing = raw - raw / ilterendiFactor;

    const effectiveHealing = Math.max(0, ilterendiHealing - overheal);

    this.ilterendiHealing += effectiveHealing;
  }

  byPlayer(event) {
    return (event.sourceID === this.player.id);
  }
  toPlayer(event) {
    return (event.targetID === this.player.id);
  }
  updatePlayerPosition(event) {
    if (!event.x || !event.y) {
      return;
    }
    this.verifyPlayerPositionUpdate(event);
    this.lastCast = event;
  }
  verifyPlayerPositionUpdate(event) {
    if (!event.x || !event.y || !this.lastCast) {
      return;
    }
    const distance = CombatLogParser.calculateDistance(this.lastCast.x, this.lastCast.y, event.x, event.y) / 100;
    const timeSince = event.timestamp - this.lastCast.timestamp;
    const maxDistance = Math.max(1, timeSince / 1000 * 10 * 1.1); // 10 yards per second + 10% margin of error
    if (distance > maxDistance) {
      console.warn('Distance since previous event (' + (Math.round(timeSince / 100) / 10) + 's ago) was ' + (Math.round(distance * 10) / 10) + ' yards:', event.type, event, this.lastCast.type, this.lastCast);
    }
  }

  // region Buffs

  /**
   * Contains all buffs which are active right now.
   * @type {Array}
   */
  activeBuffs = [];
  /**
   * Keeps track of all buffs that have been applied during the fight.
   * @type {Array}
   */
  buffHistory = [];

  hasBuff(buffAbilityId) {
    return this.activeBuffs.find(buff => buff.ability.guid === buffAbilityId) !== undefined;
  }
  getBuffUptime(buffAbilityId) {
    return this.buffHistory.reduce((uptime, buff) => {
      if (buff.ability.guid === buffAbilityId) {
        uptime += buff.uptime;
      }
      return uptime;
    }, 0);
  }

  applyActiveBuff(buff) {
    this.activeBuffs.push(buff);
  }
  removeActiveBuff(activeBuff) {
    const activeBuffIndex = this.activeBuffs.findIndex(buff => buff.ability.guid === activeBuff.ability.guid);
    let appliedAtTimestamp = null;
    if (activeBuffIndex !== -1) {
      const removedBuff = this.activeBuffs.splice(activeBuffIndex, 1)[0];
      appliedAtTimestamp = removedBuff.timestamp;
    } else {
      console.error('Tried to remove buff', activeBuff, ', but couldn\'t find it in activeBuffs.');
      appliedAtTimestamp = this.fight.start_time;
    }

    this.buffHistory.push({
      ...activeBuff,
      uptime: activeBuff.timestamp - appliedAtTimestamp,
    });
  }

  parse_applybuff(event) {
    if (!this.toPlayer(event)) return;

    this.applyActiveBuff(event);
  }
  parse_refreshbuff(event) {
    if (!this.toPlayer(event)) return;

    this.removeActiveBuff(event);
    this.applyActiveBuff(event);
  }
  parse_removebuff(event) {
    if (!this.toPlayer(event)) return;

    this.removeActiveBuff(event);
  }

  // endregion

  static calculateDistance(x1, y1, x2, y2) {
    return Math.sqrt((x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2));
  }
  static calculateMasteryEffectiveness(distance, isRuleOfLawActive) {
    const fullEffectivenessRadius = isRuleOfLawActive ? 15 : 10;
    const falloffRadius = isRuleOfLawActive ? 60 : 40;

    return Math.min(1, Math.max(0, 1 - (distance - fullEffectivenessRadius) / (falloffRadius - fullEffectivenessRadius)));
  }
}

export default CombatLogParser;
