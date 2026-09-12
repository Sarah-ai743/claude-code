import type { ActivityEntry, AuditRepository } from "./audit.types.js";

/**
 * TEMPORARY STORAGE — everything here lives in the process and is lost on
 * restart. It exists so the approval workflow can be built and tested before
 * the database arrives in Phase 1.
 *
 * The interface is the part that matters: the Postgres implementation will
 * expose exactly these methods, so no service code changes when it lands.
 */
export class InMemoryAuditRepository implements AuditRepository {
  private readonly entries: ActivityEntry[] = [];

  async append(entry: ActivityEntry): Promise<void> {
    // Append only. There is deliberately no update and no delete.
    this.entries.push(entry);
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
