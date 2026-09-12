import { newId } from "../../lib/ids.js";
import { logger } from "../../lib/logger.js";
import { auditRepository } from "./audit.repository.js";
import type { ActivityEntry, NewActivityEntry } from "./audit.types.js";

/**
 * Records one business fact.
 *
 * Called by other modules' services, never by a controller — the audit entry
 * belongs next to the change it describes. Once Postgres is in place this will
 * run inside the same transaction as that change, so an action can never be
 * committed without its audit row.
 */
export async function recordActivity(entry: NewActivityEntry): Promise<ActivityEntry> {
  const activity: ActivityEntry = {
    ...entry,
    id: newId("act"),
    createdAt: new Date().toISOString(),
  };

  await auditRepository.append(activity);

  logger.info(
    {
      requestId: activity.requestId,
      activityId: activity.id,
      action: activity.action,
      actorType: activity.actorType,
      actorId: activity.actorId,
      subjectType: activity.subjectType,
      subjectId: activity.subjectId,
    },
    "audit.activity_recorded",
  );

  return activity;
}

/** The trail for one thing — every event that touched this approval, in order. */
export async function getTrail(
  subjectType: string,
  subjectId: string,
): Promise<ActivityEntry[]> {
  return auditRepository.listBySubject(subjectType, subjectId);
}
