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
  description: string;  // full markdown body
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

export interface JiraIssueRef {
  jiraKey: string;               // e.g. "PROJ-12"
  lastSyncedStatus: string;
  epicKey?: string;              // jira key of the parent epic issue
}

export interface SyncState {
  [bmadId: string]: JiraIssueRef;
}

export interface SyncConfig {
  jira: {
    baseUrl: string;
    email: string;
    apiToken: string;
    projectKey: string;
  };
  bmad: {
    sprintStatusFile: string;
    storiesDir: string;
    epicsFile: string;
  };
  statusMap: Record<string, string>;
  issueTypeMap: Record<string, string>;
}

export interface SyncPlan {
  toCreate: Array<{ type: 'epic' | 'story'; item: Epic | Story }>;
  toTransition: Array<{ type: 'epic' | 'story'; item: Epic | Story; jiraKey: string; fromStatus: string; toStatus: string }>;
  upToDate: string[];
}
