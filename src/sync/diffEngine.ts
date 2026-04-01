import { BmadProject, Epic, Story, SyncPlan } from '../types';
import { StateStore } from './stateStore';

export function buildSyncPlan(project: BmadProject, store: StateStore): SyncPlan {
  const plan: SyncPlan = { toCreate: [], toTransition: [], upToDate: [] };

  // Process epics first — stories need their epic's provider item ID
  for (const epic of project.epics) {
    const existing = store.get(epic.id);

    if (!existing) {
      plan.toCreate.push({ type: 'epic', item: epic });
    } else if (existing.lastSyncedStatus !== epic.status) {
      plan.toTransition.push({
        type: 'epic',
        item: epic,
        itemId: existing.itemId,
        fromStatus: existing.lastSyncedStatus,
        toStatus: epic.status,
      });
    } else {
      plan.upToDate.push(epic.id);
    }
  }

  // Process stories
  for (const story of project.stories) {
    const existing = store.get(story.id);

    if (!existing) {
      plan.toCreate.push({ type: 'story', item: story });
    } else if (existing.lastSyncedStatus !== story.status) {
      plan.toTransition.push({
        type: 'story',
        item: story,
        itemId: existing.itemId,
        fromStatus: existing.lastSyncedStatus,
        toStatus: story.status,
      });
    } else {
      plan.upToDate.push(story.id);
    }
  }

  return plan;
}
