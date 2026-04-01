import { PmProvider, CreateItemResult } from '../providers/PmProvider';
import { JiraClient } from './client';
import { StatusMapper } from './statusMapper';
import { epicToJiraPayload, storyToJiraPayload } from './issueMapper';
import { SyncConfig, Epic, Story } from '../types';

export class JiraProvider implements PmProvider {
  private client: JiraClient;
  private statusMapper: StatusMapper;

  constructor(private config: SyncConfig) {
    this.client = new JiraClient(config.jira);
    this.statusMapper = new StatusMapper(this.client, config);
  }

  async createEpic(epic: Epic): Promise<CreateItemResult> {
    const payload = epicToJiraPayload(epic, this.config);
    const created = await this.client.createIssue(payload);
    return { itemId: created.key };
  }

  async createStory(story: Story, parentItemId: string | undefined): Promise<CreateItemResult> {
    const payload = storyToJiraPayload(story, parentItemId, this.config);
    const created = await this.client.createIssue(payload);
    return { itemId: created.key };
  }

  async transitionItem(itemId: string, bmadStatus: string): Promise<boolean> {
    return this.statusMapper.transition(itemId, bmadStatus);
  }

  statusDisplayName(bmadStatus: string): string {
    return this.statusMapper.toJiraStatusName(bmadStatus);
  }

  isDefaultStatus(bmadStatus: string): boolean {
    const name = this.statusDisplayName(bmadStatus).toLowerCase();
    return name === 'to do' || name === 'backlog';
  }
}
