import React from 'react';
import { Trans, t } from '@lingui/macro';

import { i18n } from 'interface/RootLocalizationProvider';
import DocumentTitle from 'interface/common/DocumentTitle';
import Panel from 'interface/others/Panel';

class HelpWanted extends React.PureComponent {
  render() {
    return (
      <>
        <DocumentTitle title="Help wanted" />

        <Panel title={<Trans>Help wanted</Trans>} bodyStyle={{ textAlign: 'justify', padding: 0, overflow: 'hidden', borderBottomLeftRadius: 5, borderBottomRightRadius: 5 }}>

          <div style={{ padding: '15px 20px', marginBottom: 5 }}>
            <Trans>WoWAnalyzer is completely open source and relies on contributors to implement spec-specific analysis. You don't need to to do anything special to contribute. See the <a href="https://github.com/WoWAnalyzer/WoWAnalyzer#contributing">contributing guidelines</a> if you want to give it a try.</Trans>
          </div>

          <img src="https://media.giphy.com/media/l1J3vV5lCmv8qx16M/giphy.gif" style={{ width: '100%' }} alt={i18n._(t`Sharing is caring`)} />
        </Panel>
      </>
    );
  }
}

export default HelpWanted;
