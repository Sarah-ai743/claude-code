import type {
  ActivityEntry,
  ActivityPage,
  ActivityQuery,
  AuditRepository,
} from "./audit.types.js";

/**
 * TEMPORARY STORAGE — everything here lives in the process and is lost on
 * restart. It exists so the activity log can be built and tested before the
 * database arrives in Phase 1.
 *
 * The interface is the part that matters: the Postgres implementation will
 * expose exactly these methods, so no service code changes when it lands.
 * Note what the interface does NOT offer — there is no update and no delete.
 */
export class InMemoryAuditRepository implements AuditRepository {
  private readonly entries: ActivityEntry[] = [];

  async append(entry: ActivityEntry): Promise<void> {
    // Append only. There is deliberately no update and no delete.
    this.entries.push(entry);
  }

  async list(query: ActivityQuery): Promise<ActivityPage> {
    // Newest first. The tie-breaker is INSERTION ORDER, not the id: two events
    // recorded in the same millisecond share a createdAt, and ids are random,
    // so breaking the tie on the id would show "approved" before "requested".
    // Postgres will give this ordering from a sequence column; here the array
    // index is that sequence.
    let items = this.entries
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const byDate = b.entry.createdAt.localeCompare(a.entry.createdAt);
        return byDate !== 0 ? byDate : b.index - a.index;
      })
      .map(({ entry }) => entry);

    if (query.leadId) items = items.filter((entry) => entry.leadId === query.leadId);
    if (query.eventType) items = items.filter((entry) => entry.eventType === query.eventType);

    if (query.date) {
      // A whole UTC calendar day. ISO timestamps sort and compare as strings,
      // so a prefix match is exact here and needs no date parsing.
      items = items.filter((entry) => entry.createdAt.startsWith(query.date as string));
    }
    if (query.from) {
      items = items.filter((entry) => entry.createdAt >= (query.from as string));
    }
    if (query.to) {
      items = items.filter((entry) => entry.createdAt < (query.to as string));
    }

    if (query.cursor) {
      const index = items.findIndex((entry) => entry.id === query.cursor);
      // An unknown cursor returns the first page rather than an empty one.
      if (index >= 0) items = items.slice(index + 1);
    }

    const page = items.slice(0, query.limit);
    const hasMore = items.length > page.length;

    return {
      items: page,
      hasMore,
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async listBySubject(subjectType: string, subjectId: string): Promise<ActivityEntry[]> {
    return this.entries.filter(
      (entry) => entry.subjectType === subjectType && entry.subjectId === subjectId,
    );
  }

  async listAll(): Promise<ActivityEntry[]> {
    return [...this.entries];
  }

  /** Test helper. Not part of the interface a database will implement. */
  clear(): void {
    this.entries.length = 0;
  }
}

export const auditRepository = new InMemoryAuditRepository();
