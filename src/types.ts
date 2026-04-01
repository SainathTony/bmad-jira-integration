export type StoryStatus =
  | 'backlog'
  | 'ready-for-dev'
  | 'in-progress'
  | 'review'
  | 'done';

export type EpicStatus = 'backlog' | 'in-progress' | 'done';

export interface Story {
  id: string;           // e.g. "1-1-candidate-account-registration-and-sign-in"
  epicId: string;       // e.g. "epic-1"
  title: string;
  status: StoryStatus;
  description: string;
  acceptanceCriteria: string[];
  filePath: string;
}

export interface Epic {
  id: string;           // e.g. "epic-1"
  title: string;
  status: EpicStatus;
}

export interface BmadProject {
  epics: Epic[];
  stories: Story[];
}

// ── Provider-agnostic state ───────────────────────────────────────────────────

export interface ProviderItemRef {
  itemId: string;             // Jira issue key (e.g. "PROJ-12") or Trello card/label ID
  lastSyncedStatus: string;
  parentItemId?: string;      // Jira epic key or Trello label ID of parent epic
}

/** Shape written by older versions of this tool (Jira-only). Migrated on read. */
export interface LegacyJiraItemRef {
  jiraKey: string;
  lastSyncedStatus: string;
  epicKey?: string;
}

export type SyncStateEntry = ProviderItemRef | LegacyJiraItemRef;

export interface SyncState {
  [bmadId: string]: SyncStateEntry;
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface SyncConfig {
  provider?: 'jira' | 'trello';   // defaults to 'jira' when absent
  jira: {
    baseUrl: string;
    email: string;
    apiToken: string;
    projectKey: string;
  };
  trello?: {
    apiKey: string;               // literal or "${TRELLO_API_KEY}"
    token: string;                // literal or "${TRELLO_TOKEN}"
    boardId: string;
    /** Maps BMAD status → Trello List name. Lists must exist on the board. */
    listMap: Record<string, string>;
  };
  bmad: {
    sprintStatusFile: string;
    storiesDir: string;
    epicsFile: string;
  };
  statusMap: Record<string, string>;
  issueTypeMap: Record<string, string>;
}

// ── Sync plan / result ────────────────────────────────────────────────────────

export interface SyncPlan {
  toCreate: Array<{ type: 'epic' | 'story'; item: Epic | Story }>;
  toTransition: Array<{
    type: 'epic' | 'story';
    item: Epic | Story;
    itemId: string;         // was jiraKey
    fromStatus: string;
    toStatus: string;
  }>;
  upToDate: string[];
}

export interface SyncResult {
  created: Array<{ bmadId: string; itemId: string }>;
  transitioned: Array<{ bmadId: string; itemId: string; toStatus: string; success: boolean }>;
  skipped: string[];
  errors: Array<{ bmadId: string; error: string }>;
}
