import { newId } from "../../lib/ids.js";
import { logger } from "../../lib/logger.js";
import { auditRepository } from "./audit.repository.js";
import { redactMetadata } from "./audit.redact.js";
import type {
  ActivityEntry,
  ActivityPage,
  ActivityQuery,
  NewActivityEntry,
} from "./audit.types.js";

/**
 * Records one business fact.
 *
 * Called by other modules' services, never by a controller — the activity entry
 * belongs next to the change it describes. Once Postgres is in place this will
 * run inside the same transaction as that change, so an action can never be
 * committed without its activity row.
 *
 * Metadata goes through secret redaction on the way in. This log is never
 * deleted, so anything stored here is stored permanently.
 */
export async function recordActivity(entry: NewActivityEntry): Promise<ActivityEntry> {
  const activity: ActivityEntry = {
    ...entry,
    metadata: redactMetadata(entry.metadata),
    id: newId("act"),
    createdAt: new Date().toISOString(),
  };

  await auditRepository.append(activity);

  // The log line carries the identifying fields only. Metadata is not logged:
  // it is already stored in the activity row, and duplicating it into a log
  // stream is a second place for something sensitive to end up.
  logger.info(
    {
      requestId: activity.requestId,
      activityId: activity.id,
      eventType: activity.eventType,
      actorType: activity.actorType,
      userId: activity.userId,
      leadId: activity.leadId,
      subjectType: activity.subjectType,
      subjectId: activity.subjectId,
    },
    "audit.activity_recorded",
  );

  return activity;
}

export async function listActivity(query: ActivityQuery): Promise<ActivityPage> {
  return auditRepository.list(query);
}

/** The trail for one thing — every event that touched it, in order. */
export async function getTrail(
  subjectType: string,
  subjectId: string,
): Promise<ActivityEntry[]> {
  return auditRepository.listBySubject(subjectType, subjectId);
}
