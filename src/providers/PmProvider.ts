import { Epic, Story } from '../types';

export interface CreateItemResult {
  itemId: string;
}

/**
 * Abstraction over any project management tool (Jira, Trello, …).
 * SyncEngine talks only to this interface — never to a concrete client.
 */
export interface PmProvider {
  /** Create an epic (Jira Epic issue, Trello Label, …). Returns provider item ID. */
  createEpic(epic: Epic): Promise<CreateItemResult>;

  /**
   * Create a story (Jira Story issue, Trello Card, …).
   * parentItemId is the provider ID of the already-created parent epic, if any.
   */
  createStory(story: Story, parentItemId: string | undefined): Promise<CreateItemResult>;

  /**
   * Transition an existing item to the BMAD status.
   * Returns true if applied, false if the target was not reachable.
   */
  transitionItem(itemId: string, bmadStatus: string): Promise<boolean>;

  /**
   * Human-readable name for the provider-side status (used in dry-run output).
   * Must not make network calls.
   */
  statusDisplayName(bmadStatus: string): string;

  /**
   * True if this BMAD status maps to the provider's default creation state,
   * meaning no transition call is needed immediately after creation.
   */
  isDefaultStatus(bmadStatus: string): boolean;
}
