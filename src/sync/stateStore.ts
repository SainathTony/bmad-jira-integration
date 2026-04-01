import * as fs from 'fs';
import * as path from 'path';
import { SyncState, SyncStateEntry, ProviderItemRef, LegacyJiraItemRef } from '../types';

const STATE_FILE_NAME = '.bmad-jira-state.json';

function isLegacy(entry: SyncStateEntry): entry is LegacyJiraItemRef {
  return 'jiraKey' in entry;
}

function normalize(entry: SyncStateEntry): ProviderItemRef {
  if (isLegacy(entry)) {
    return {
      itemId: entry.jiraKey,
      lastSyncedStatus: entry.lastSyncedStatus,
      parentItemId: entry.epicKey,
    };
  }
  return entry as ProviderItemRef;
}

export class StateStore {
  private statePath: string;
  private state: Record<string, ProviderItemRef>;

  constructor(workspaceRoot: string) {
    this.statePath = path.join(workspaceRoot, STATE_FILE_NAME);
    this.state = this.load();
  }

  private load(): Record<string, ProviderItemRef> {
    if (!fs.existsSync(this.statePath)) return {};
    try {
      const raw = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as SyncState;
      const normalized: Record<string, ProviderItemRef> = {};
      for (const [id, entry] of Object.entries(raw)) {
        normalized[id] = normalize(entry);
      }
      return normalized;
    } catch {
      return {};
    }
  }

  save(): void {
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2) + '\n', 'utf-8');
  }

  get(bmadId: string): ProviderItemRef | undefined {
    return this.state[bmadId];
  }

  set(bmadId: string, ref: ProviderItemRef): void {
    this.state[bmadId] = ref;
  }

  updateStatus(bmadId: string, newStatus: string): void {
    if (this.state[bmadId]) {
      this.state[bmadId].lastSyncedStatus = newStatus;
    }
  }

  all(): Record<string, ProviderItemRef> {
    return this.state;
  }

  statePath_(): string {
    return this.statePath;
  }
}
