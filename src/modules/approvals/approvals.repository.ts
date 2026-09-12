import type { ApprovalRecord, ListApprovalsQuery } from "./approvals.schema.js";

export interface ApprovalPage {
  items: ApprovalRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApprovalRepository {
  create(record: ApprovalRecord): Promise<ApprovalRecord>;
  findById(id: string): Promise<ApprovalRecord | null>;
  list(query: ListApprovalsQuery): Promise<ApprovalPage>;
  save(record: ApprovalRecord): Promise<ApprovalRecord>;
}

/**
 * TEMPORARY STORAGE — a Map in the process. Everything is lost on restart, and
 * two server instances would not see each other's queue.
 *
 * This is deliberate: the workflow, the validation, the audit trail and the
 * state machine are what this feature is about, and they are all real. Swapping
 * this class for a Prisma-backed one in Phase 1 changes no other file.
 */
export class InMemoryApprovalRepository implements ApprovalRepository {
  private readonly records = new Map<string, ApprovalRecord>();
  /** Insertion order, used to break createdAt ties. Postgres will use a sequence. */
  private readonly order = new Map<string, number>();
  private sequence = 0;

  async create(record: ApprovalRecord): Promise<ApprovalRecord> {
    this.records.set(record.id, record);
    this.order.set(record.id, this.sequence += 1);
    return record;
  }

  async findById(id: string): Promise<ApprovalRecord | null> {
    return this.records.get(id) ?? null;
  }

  async save(record: ApprovalRecord): Promise<ApprovalRecord> {
    this.records.set(record.id, record);
    return record;
  }

  async list(query: ListApprovalsQuery): Promise<ApprovalPage> {
    // Newest first. The tie-breaker is insertion order, not the id: two items
    // created in the same millisecond share a createdAt, and ids are random, so
    // breaking the tie on the id would scramble same-millisecond items.
    let items = [...this.records.values()].sort((a, b) => {
      const byDate = b.createdAt.localeCompare(a.createdAt);
      if (byDate !== 0) return byDate;
      return (this.order.get(b.id) ?? 0) - (this.order.get(a.id) ?? 0);
    });

    if (query.status) items = items.filter((item) => item.status === query.status);
    if (query.riskLevel) items = items.filter((item) => item.riskLevel === query.riskLevel);
    if (query.leadId) items = items.filter((item) => item.leadId === query.leadId);

    if (query.cursor) {
      const index = items.findIndex((item) => item.id === query.cursor);
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

  /** Test helper. Not part of the interface a database will implement. */
  clear(): void {
    this.records.clear();
    this.order.clear();
    this.sequence = 0;
  }
}

export const approvalRepository = new InMemoryApprovalRepository();
