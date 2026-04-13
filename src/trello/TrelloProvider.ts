import { PmProvider, CreateItemResult } from '../providers/PmProvider';
import { TrelloClient, TrelloList, TrelloLabel } from './TrelloClient';
import { SyncConfig, Epic, Story } from '../types';

export class TrelloProvider implements PmProvider {
  private client: TrelloClient;
  private boardId: string;
  private listMap: Record<string, string>;   // BMAD status → Trello list name

  // Lazily populated per-run caches (name → id)
  private listCache: Map<string, string> | null = null;
  private labelCache: Map<string, string> | null = null;
  private epicColorIndex = 0;

  constructor(private config: SyncConfig) {
    const tc = config.trello!;
    const apiKey = resolveEnv(tc.apiKey);
    const token  = resolveEnv(tc.token);
    this.client  = new TrelloClient(apiKey, token);
    this.boardId = tc.boardId;
    this.listMap = tc.listMap;
  }

  // ── PmProvider ──────────────────────────────────────────────────────────────

  async createEpic(epic: Epic): Promise<CreateItemResult> {
    const labels = await this.getOrBuildLabelCache();
    const existing = labels.get(epic.title);
    if (existing) return { itemId: existing };

    const created = await this.client.createLabel(this.boardId, epic.title, this.epicColorIndex++);
    this.labelCache!.set(epic.title, created.id);
    return { itemId: created.id };
  }

  async createStory(story: Story, parentItemId: string | undefined): Promise<CreateItemResult> {
    const lists  = await this.getOrBuildListCache();
    const listId = await this.resolveListId(story.status, lists);

    const desc = buildCardDescription(story);
    const labelIds = parentItemId ? [parentItemId] : [];
    const card = await this.client.createCard(listId, story.title, desc, labelIds);
    return { itemId: card.id };
  }

  async transitionItem(itemId: string, bmadStatus: string): Promise<boolean> {
    const lists  = await this.getOrBuildListCache();
    const listId = lists.get(this.resolveListName(bmadStatus));
    if (!listId) return false;
    await this.client.moveCard(itemId, listId);
    return true;
  }

  statusDisplayName(bmadStatus: string): string {
    return this.resolveListName(bmadStatus);
  }

  isDefaultStatus(bmadStatus: string): boolean {
    return this.resolveListName(bmadStatus).toLowerCase() === 'backlog';
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private resolveListName(bmadStatus: string): string {
    return this.listMap[bmadStatus] ?? bmadStatus;
  }

  private async resolveListId(bmadStatus: string, lists: Map<string, string>): Promise<string> {
    const listName = this.resolveListName(bmadStatus);
    const listId   = lists.get(listName);
    if (!listId) {
      const available = [...lists.keys()].join(', ');
      throw new Error(
        `Trello list "${listName}" not found on board.\n` +
        `Available lists: ${available}\n` +
        `Update trello.listMap in bmad-jira.config.json to match your board.`
      );
    }
    return listId;
  }

  private async getOrBuildListCache(): Promise<Map<string, string>> {
    if (this.listCache) return this.listCache;
    const lists: TrelloList[] = await this.client.getLists(this.boardId);
    this.listCache = new Map(lists.map((l) => [l.name, l.id]));
    return this.listCache;
  }

  private async getOrBuildLabelCache(): Promise<Map<string, string>> {
    if (this.labelCache) return this.labelCache;
    const labels: TrelloLabel[] = await this.client.getLabels(this.boardId);
    this.labelCache = new Map(labels.filter((l) => l.name).map((l) => [l.name, l.id]));
    return this.labelCache;
  }
}

function resolveEnv(value: string): string {
  if (value.startsWith('${') && value.endsWith('}')) {
    return process.env[value.slice(2, -1)] ?? '';
  }
  return value;
}

function buildCardDescription(story: Story): string {
  // If full content is available, use it for a rich description
  if (story.fullContent) {
    // Extract key sections for a structured but comprehensive description
    const lines: string[] = [];
    
    // Add the story foundation/user story
    if (story.description) {
      lines.push('## Story', story.description, '');
    }
    
    // Add acceptance criteria
    if (story.acceptanceCriteria.length > 0) {
      lines.push('## Acceptance Criteria');
      story.acceptanceCriteria.forEach((ac, i) => lines.push(`${i + 1}. ${ac}`));
      lines.push('');
    }
    
    // Add link to full story document
    lines.push(`---`);
    lines.push(`**Full Story:** ${story.filePath}`);
    
    return lines.join('\n').trim();
  }
  
  // Fallback to basic description
  const lines: string[] = [];
  if (story.description) lines.push(story.description, '');
  if (story.acceptanceCriteria.length > 0) {
    lines.push('**Acceptance Criteria**');
    story.acceptanceCriteria.forEach((ac, i) => lines.push(`${i + 1}. ${ac}`));
  }
  return lines.join('\n').trim();
}
