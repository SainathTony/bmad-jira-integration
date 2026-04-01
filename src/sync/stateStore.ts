import * as fs from 'fs';
import * as path from 'path';
import { SyncState, JiraIssueRef } from '../types';

const STATE_FILE_NAME = '.bmad-jira-state.json';

export class StateStore {
  private statePath: string;
  private state: SyncState;

  constructor(workspaceRoot: string) {
    this.statePath = path.join(workspaceRoot, STATE_FILE_NAME);
    this.state = this.load();
  }

  private load(): SyncState {
    if (!fs.existsSync(this.statePath)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as SyncState;
    } catch {
      return {};
    }
  }

  save(): void {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2) + '\n', 'utf-8');
  }

  get(bmadId: string): JiraIssueRef | undefined {
    return this.state[bmadId];
  }

  set(bmadId: string, ref: JiraIssueRef): void {
    this.state[bmadId] = ref;
  }

  updateStatus(bmadId: string, newStatus: string): void {
    if (this.state[bmadId]) {
      this.state[bmadId].lastSyncedStatus = newStatus;
    }
  }

  all(): SyncState {
    return this.state;
  }

  statePath_(): string {
    return this.statePath;
  }
}
