import { SyncPlan, SyncResult, Epic, Story } from '../types';
import { PmProvider } from '../providers/PmProvider';
import { StateStore } from './stateStore';

export class SyncEngine {
  constructor(private provider: PmProvider, private store: StateStore) {}

  private async transitionAfterCreate(
    bmadId: string,
    itemId: string,
    bmadStatus: string,
    result: SyncResult
  ): Promise<void> {
    if (this.provider.isDefaultStatus(bmadStatus)) return;
    try {
      const success = await this.provider.transitionItem(itemId, bmadStatus);
      result.transitioned.push({ bmadId, itemId, toStatus: bmadStatus, success });
    } catch {
      result.transitioned.push({ bmadId, itemId, toStatus: bmadStatus, success: false });
    }
  }

  async executePlan(plan: SyncPlan, dryRun = false): Promise<SyncResult> {
    const result: SyncResult = { created: [], transitioned: [], skipped: [], errors: [] };

    result.skipped.push(...plan.upToDate);

    // Create epics first so their itemIds are available when creating stories
    const epicsToCreate   = plan.toCreate.filter((c) => c.type === 'epic');
    const storiesToCreate = plan.toCreate.filter((c) => c.type === 'story');

    for (const { item } of epicsToCreate) {
      const epic = item as Epic;
      if (dryRun) {
        const statusLabel = this.provider.statusDisplayName(epic.status);
        console.log(`  [dry-run] Would create Epic: ${epic.id} → "${epic.title}" then transition to "${statusLabel}"`);
        continue;
      }
      try {
        const created = await this.provider.createEpic(epic);
        this.store.set(epic.id, { itemId: created.itemId, lastSyncedStatus: epic.status });
        result.created.push({ bmadId: epic.id, itemId: created.itemId });
        await this.transitionAfterCreate(epic.id, created.itemId, epic.status, result);
      } catch (err: unknown) {
        result.errors.push({ bmadId: epic.id, error: String(err) });
      }
    }

    for (const { item } of storiesToCreate) {
      const story = item as Story;
      if (dryRun) {
        const epicRef     = this.store.get(story.epicId);
        const statusLabel = this.provider.statusDisplayName(story.status);
        console.log(
          `  [dry-run] Would create Story: ${story.id} → "${story.title}"` +
          ` (parent: ${epicRef?.itemId ?? 'no epic yet'}) then transition to "${statusLabel}"`
        );
        continue;
      }
      try {
        const epicRef = this.store.get(story.epicId);
        const created = await this.provider.createStory(story, epicRef?.itemId);
        this.store.set(story.id, {
          itemId: created.itemId,
          lastSyncedStatus: story.status,
          parentItemId: epicRef?.itemId,
        });
        result.created.push({ bmadId: story.id, itemId: created.itemId });
        await this.transitionAfterCreate(story.id, created.itemId, story.status, result);
      } catch (err: unknown) {
        result.errors.push({ bmadId: story.id, error: String(err) });
      }
    }

    // Transition items that already exist but whose status drifted
    for (const { item, itemId, toStatus } of plan.toTransition) {
      const bmadId = item.id;
      if (dryRun) {
        const statusLabel = this.provider.statusDisplayName(toStatus);
        console.log(`  [dry-run] Would transition ${itemId} (${bmadId}) → "${statusLabel}"`);
        continue;
      }
      try {
        const success = await this.provider.transitionItem(itemId, toStatus);
        if (success) this.store.updateStatus(bmadId, toStatus);
        result.transitioned.push({ bmadId, itemId, toStatus, success });
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
