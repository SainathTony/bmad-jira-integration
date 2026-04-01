import { SyncConfig } from '../types';
import { PmProvider } from './PmProvider';
import { JiraProvider } from '../jira/JiraProvider';
import { TrelloProvider } from '../trello/TrelloProvider';

export function createProvider(config: SyncConfig): PmProvider {
  const providerName = config.provider ?? 'jira';
  switch (providerName) {
    case 'jira':
      return new JiraProvider(config);
    case 'trello':
      if (!config.trello) {
        throw new Error(
          'Provider is set to "trello" but no "trello" block found in bmad-jira.config.json.\n' +
          'Run "bmad-jira init" to set up Trello credentials.'
        );
      }
      return new TrelloProvider(config);
    default:
      throw new Error(
        `Unknown provider "${providerName}". Supported values: "jira", "trello"`
      );
  }
}
