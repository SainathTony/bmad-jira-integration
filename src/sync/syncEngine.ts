import { SyncConfig, SyncPlan, Epic, Story } from '../types';
import { JiraClient } from '../jira/client';
import { StatusMapper } from '../jira/statusMapper';
import { epicToJiraPayload, storyToJiraPayload } from '../jira/issueMapper';
import { StateStore } from './stateStore';

export interface SyncResult {
  created: Array<{ bmadId: string; jiraKey: string }>;
  transitioned: Array<{ bmadId: string; jiraKey: string; toStatus: string; success: boolean }>;
  skipped: string[];
  errors: Array<{ bmadId: string; error: string }>;
}

export class SyncEngine {
  private client: JiraClient;
  private statusMapper: StatusMapper;

  constructor(private config: SyncConfig, private store: StateStore) {
    this.client = new JiraClient(config.jira);
    this.statusMapper = new StatusMapper(this.client, config);
  }

  /** Statuses that map to Jira's default "To Do" — no transition needed after creation */
  private isDefaultJiraStatus(bmadStatus: string): boolean {
    const jiraName = this.statusMapper.toJiraStatusName(bmadStatus).toLowerCase();
    return jiraName === 'to do' || jiraName === 'backlog';
  }

  private async transitionAfterCreate(
    bmadId: string,
    jiraKey: string,
    bmadStatus: string,
    result: SyncResult
  ): Promise<void> {
    if (this.isDefaultJiraStatus(bmadStatus)) return;
    try {
      const success = await this.statusMapper.transition(jiraKey, bmadStatus);
      result.transitioned.push({ bmadId, jiraKey, toStatus: bmadStatus, success });
    } catch {
      // Non-fatal: issue was created, transition just didn't apply
      result.transitioned.push({ bmadId, jiraKey, toStatus: bmadStatus, success: false });
    }
  }

  async executePlan(plan: SyncPlan, dryRun = false): Promise<SyncResult> {
    const result: SyncResult = { created: [], transitioned: [], skipped: [], errors: [] };

    result.skipped.push(...plan.upToDate);

    // Create items — epics first, then stories (so epic Jira keys exist for parent linking)
    const epicsToCreate = plan.toCreate.filter((c) => c.type === 'epic');
    const storiesToCreate = plan.toCreate.filter((c) => c.type === 'story');

    for (const { item } of epicsToCreate) {
      const epic = item as Epic;
      if (dryRun) {
        const jiraStatus = this.statusMapper.toJiraStatusName(epic.status);
        console.log(`  [dry-run] Would create Epic: ${epic.id} → "${epic.title}" then transition to "${jiraStatus}"`);
        continue;
      }
      try {
        const payload = epicToJiraPayload(epic, this.config);
        const created = await this.client.createIssue(payload);
        this.store.set(epic.id, { jiraKey: created.key, lastSyncedStatus: epic.status });
        result.created.push({ bmadId: epic.id, jiraKey: created.key });
        await this.transitionAfterCreate(epic.id, created.key, epic.status, result);
      } catch (err: unknown) {
        result.errors.push({ bmadId: epic.id, error: String(err) });
      }
    }

    for (const { item } of storiesToCreate) {
      const story = item as Story;
      if (dryRun) {
        const epicRef = this.store.get(story.epicId);
        const jiraStatus = this.statusMapper.toJiraStatusName(story.status);
        console.log(
          `  [dry-run] Would create Story: ${story.id} → "${story.title}" (parent: ${epicRef?.jiraKey ?? 'no epic yet'}) then transition to "${jiraStatus}"`
        );
        continue;
      }
      try {
        const epicRef = this.store.get(story.epicId);
        const payload = storyToJiraPayload(story, epicRef?.jiraKey, this.config);
        const created = await this.client.createIssue(payload);
        this.store.set(story.id, {
          jiraKey: created.key,
          lastSyncedStatus: story.status,
          epicKey: epicRef?.jiraKey,
        });
        result.created.push({ bmadId: story.id, jiraKey: created.key });
        await this.transitionAfterCreate(story.id, created.key, story.status, result);
      } catch (err: unknown) {
        result.errors.push({ bmadId: story.id, error: String(err) });
      }
    }

    // Transition items that already exist in Jira but whose status drifted
    for (const { item, jiraKey, toStatus } of plan.toTransition) {
      const bmadId = item.id;
      if (dryRun) {
        const jiraStatusName = this.statusMapper.toJiraStatusName(toStatus);
        console.log(
          `  [dry-run] Would transition ${jiraKey} (${bmadId}) → "${jiraStatusName}"`
        );
        continue;
      }
      try {
        const success = await this.statusMapper.transition(jiraKey, toStatus);
        if (success) {
          this.store.updateStatus(bmadId, toStatus);
        }
        result.transitioned.push({ bmadId, jiraKey, toStatus, success });
      } catch (err: unknown) {
        result.errors.push({ bmadId, error: String(err) });
      }
    }

    if (!dryRun) {
      this.store.save();
    }

    return result;
  }
}
