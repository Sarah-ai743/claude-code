/**
 * The activity log: an append-only record of who did what.
 *
 * Rows are never updated and never deleted. That is the whole point — an audit
 * trail you can edit is not an audit trail. When something looks wrong, these
 * rows are the evidence of what actually happened.
 */
export type ActorType = "USER" | "AI" | "SYSTEM" | "API_KEY";

export interface ActivityEntry {
  id: string;
  /** Was this a person, the AI, or the system acting on its own? */
  actorType: ActorType;
  /** Who specifically. Until authentication lands this is supplied by the caller. */
  actorId: string;
  /** Dotted past-tense fact, e.g. "approval.approved". */
  action: string;
  subjectType: string;
  subjectId: string;
  /** Anything worth keeping about this specific event. */
  metadata: Record<string, unknown>;
  /** Ties the entry back to the HTTP request that caused it. */
  requestId: string;
  createdAt: string;
}

export type NewActivityEntry = Omit<ActivityEntry, "id" | "createdAt">;

export interface AuditRepository {
  append(entry: ActivityEntry): Promise<void>;
  listBySubject(subjectType: string, subjectId: string): Promise<ActivityEntry[]>;
  listAll(): Promise<ActivityEntry[]>;
}
