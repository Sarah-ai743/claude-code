/**
 * The activity log: an append-only record of who did what.
 *
 * Rows are never updated and never deleted. That is the whole point — an audit
 * trail you can edit is not an audit trail. When something looks wrong, these
 * rows are the evidence of what actually happened.
 */

/**
 * The vocabulary of things worth recording.
 *
 * A closed list rather than free text: a feed you can filter, count and alert
 * on needs a fixed set of names. Adding an event means adding it here, which is
 * a deliberate decision rather than a typo in a string literal.
 */
export const EVENT_TYPES = [
  "LEAD_CREATED",
  "EMAIL_RECEIVED",
  "EMAIL_DUPLICATE_IGNORED",
  "LEAD_CREATED_FROM_EMAIL",
  "EMAIL_LINKED_TO_LEAD",
  "LEAD_ANALYSIS_FAILED",
  "LEAD_ANALYZED",
  "REPLY_GENERATED",
  "FOLLOWUP_SUGGESTED",
  "FOLLOWUP_BLOCKED",
  "APPROVAL_REQUESTED",
  "APPROVAL_APPROVED",
  "APPROVAL_REJECTED",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type ActorType = "USER" | "AI" | "SYSTEM" | "API_KEY";

export interface ActivityEntry {
  id: string;
  eventType: EventType;
  /** The lead this concerns, when there is one. */
  leadId: string | null;
  /**
   * The person responsible, when a person was involved. Null for anything the
   * AI or the system did on its own — which is exactly the question customers
   * ask first: "was that a person or the robot?"
   */
  userId: string | null;
  actorType: ActorType;
  /** One human-readable sentence. Never contains customer message content. */
  description: string;
  /** Structured detail. Passed through secret redaction before it is stored. */
  metadata: Record<string, unknown>;
  /** Ties the entry back to the HTTP request that caused it. */
  requestId: string;
  /** What this entry is about, e.g. an approval. Used to build one item's trail. */
  subjectType: string | null;
  subjectId: string | null;
  createdAt: string;
}

export type NewActivityEntry = Omit<ActivityEntry, "id" | "createdAt">;

export interface ActivityQuery {
  leadId?: string | undefined;
  eventType?: EventType | undefined;
  /** A single UTC calendar day, as YYYY-MM-DD. */
  date?: string | undefined;
  /** Inclusive lower bound, ISO-8601. */
  from?: string | undefined;
  /** Exclusive upper bound, ISO-8601. */
  to?: string | undefined;
  limit: number;
  cursor?: string | undefined;
}

export interface ActivityPage {
  items: ActivityEntry[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AuditRepository {
  append(entry: ActivityEntry): Promise<void>;
  list(query: ActivityQuery): Promise<ActivityPage>;
  listBySubject(subjectType: string, subjectId: string): Promise<ActivityEntry[]>;
  listAll(): Promise<ActivityEntry[]>;
}
