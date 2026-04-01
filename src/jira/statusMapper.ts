import { JiraClient } from './client';
import { SyncConfig } from '../types';

export class StatusMapper {
  constructor(private client: JiraClient, private config: SyncConfig) {}

  /** Map a BMAD status string to the configured Jira status name */
  toJiraStatusName(bmadStatus: string): string {
    return this.config.statusMap[bmadStatus] ?? bmadStatus;
  }

  /** Resolve the transition ID needed to move issueKey to the target BMAD status */
  async resolveTransitionId(issueKey: string, targetBmadStatus: string): Promise<string | null> {
    const jiraStatusName = this.toJiraStatusName(targetBmadStatus);
    return this.client.findTransitionId(issueKey, jiraStatusName);
  }

  /** Attempt to transition an issue, returns true if successful */
  async transition(issueKey: string, targetBmadStatus: string): Promise<boolean> {
    const transitionId = await this.resolveTransitionId(issueKey, targetBmadStatus);
    if (!transitionId) return false;
    await this.client.transitionIssue(issueKey, transitionId);
    return true;
  }
}
