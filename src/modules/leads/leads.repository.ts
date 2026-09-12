import type { LeadAnalysis } from "../../ai/tasks/analyzeLead.task.js";

/**
 * Lead storage — new in this feature.
 *
 * Until now nothing in LeadPilot actually stored a lead: `leadId` was a string
 * that other modules referred to but nothing owned. Turning an email into a
 * lead needs somewhere to put it, so this is that place.
 *
 * TEMPORARY STORAGE — a Map in the process, lost on restart, like the approval
 * and activity stores. The interface is what matters; a Prisma implementation
 * will satisfy exactly these methods.
 */
export type LeadSource = "EMAIL" | "API" | "MANUAL";

export interface LeadRecord {
  id: string;
  /** Lowercased, trimmed. This is the matching key. */
  email: string;
  name: string | null;
  source: LeadSource;
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "QUOTE_SENT" | "WON" | "LOST";

  /** Latest analysis, flattened for easy reading by a UI. Null until analyzed. */
  temperature: LeadAnalysis["temperature"] | null;
  intent: string | null;
  urgency: LeadAnalysis["urgency"] | null;
  mainNeed: string | null;
  recommendedAction: string | null;
  suggestedReply: string | null;
  confidence: number | null;

  /** Enough context for a lead list. The full email body is deliberately not stored. */
  lastSubject: string | null;
  lastMessagePreview: string | null;

  messageCount: number;
  createdAt: string;
  updatedAt: string;
  lastContactAt: string | null;
}

export interface LeadRepository {
  create(record: LeadRecord): Promise<LeadRecord>;
  findById(id: string): Promise<LeadRecord | null>;
  findByEmail(email: string): Promise<LeadRecord | null>;
  save(record: LeadRecord): Promise<LeadRecord>;
  list(): Promise<LeadRecord[]>;
}

/** Two addresses that differ only by case or spacing are the same person. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class InMemoryLeadRepository implements LeadRepository {
  private readonly records = new Map<string, LeadRecord>();
  /** email -> id, so matching a sender is a lookup rather than a scan. */
  private readonly byEmail = new Map<string, string>();

  async create(record: LeadRecord): Promise<LeadRecord> {
    this.records.set(record.id, record);
    this.byEmail.set(record.email, record.id);
    return record;
  }

  async findById(id: string): Promise<LeadRecord | null> {
    return this.records.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<LeadRecord | null> {
    const id = this.byEmail.get(normalizeEmail(email));
    return id ? (this.records.get(id) ?? null) : null;
  }

  async save(record: LeadRecord): Promise<LeadRecord> {
    this.records.set(record.id, record);
    this.byEmail.set(record.email, record.id);
    return record;
  }

  async list(): Promise<LeadRecord[]> {
    return [...this.records.values()];
  }

  /** Test helper. Not part of the interface a database will implement. */
  clear(): void {
    this.records.clear();
    this.byEmail.clear();
  }
}

export const leadRepository = new InMemoryLeadRepository();
