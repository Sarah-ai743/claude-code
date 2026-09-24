import { describe, it, expect, vi, beforeEach } from "vitest";
import { FakeSupabase } from "../helpers/fakeSupabase";
import type { LeadAnalysis } from "@/lib/ai/schema";

const mockAnalyzeLead = vi.fn();
vi.mock("@/lib/ai/analyzeLead", () => ({
  analyzeLead: (...args: unknown[]) => mockAnalyzeLead(...args),
}));

const { createLeadAndAnalyze, cancelFollowUpsForLead, scheduleFirstFollowUp } = await import("@/lib/leadPipeline");

function baseAnalysis(overrides: Partial<LeadAnalysis> = {}): LeadAnalysis {
  return {
    language: "en",
    intent: "book a cleaning",
    requested_service: "Standard Cleaning",
    urgency: "medium",
    qualification_status: "needs_information",
    missing_information: ["date"],
    sentiment: "positive",
    recommended_action: "ask_question",
    reply: "What date works best?",
    human_review_required: false,
    human_review_reason: null,
    ...overrides,
  };
}

function seedOrg(db: FakeSupabase, id: string, automationMode: string) {
  db.seed("organizations", [
    {
      id,
      slug: `org-${id}`,
      name: `Org ${id}`,
      industry: "Cleaning",
      country: "US",
      timezone: "UTC",
      currency: "USD",
      languages: ["en"],
      website: null,
      description: null,
      business_hours: {},
      booking_url: null,
      contact_email: "hi@example.com",
      contact_phone: null,
      brand_tone: null,
      ai_instructions: null,
      automation_mode: automationMode,
      onboarding_completed: true,
      plan: "starter",
      updated_at: new Date().toISOString(),
    },
  ]);
}

beforeEach(() => {
  mockAnalyzeLead.mockReset();
});

describe("createLeadAndAnalyze", () => {
  it("stores the lead, conversation, and customer message", async () => {
    const db = new FakeSupabase();
    seedOrg(db, "org1", "draft");
    mockAnalyzeLead.mockResolvedValue({
      analysis: baseAnalysis(),
      promptVersion: "v1",
      model: "claude",
      latencyMs: 10,
      usedFallback: false,
      guardrailWarnings: [],
    });

    const result = await createLeadAndAnalyze(db as any, "org1", {
      name: "Jane Doe",
      email: "jane@example.com",
      message: "I need a quote for a standard clean.",
    });

    expect(result.deduplicated).toBe(false);
    expect(db.table("leads")).toHaveLength(1);
    expect(db.table("conversations")).toHaveLength(1);
    const messages = db.table("messages");
    expect(messages.some((m) => m.sender === "customer")).toBe(true);
    expect(messages.some((m) => m.sender === "ai")).toBe(true);
  });

  it("draft mode always queues the AI reply for approval, even for a routine action", async () => {
    const db = new FakeSupabase();
    seedOrg(db, "org1", "draft");
    mockAnalyzeLead.mockResolvedValue({
      analysis: baseAnalysis({ recommended_action: "reply", human_review_required: false }),
      promptVersion: "v1",
      model: "claude",
      latencyMs: 10,
      usedFallback: false,
      guardrailWarnings: [],
    });

    await createLeadAndAnalyze(db as any, "org1", { name: "A", email: "a@example.com", message: "hi" });

    const aiMessage = db.table("messages").find((m) => m.sender === "ai");
    expect(aiMessage?.pending_approval).toBe(true);
    expect(db.table("approvals")).toHaveLength(1);
  });

  it("safe_autopilot auto-sends a routine reply", async () => {
    const db = new FakeSupabase();
    seedOrg(db, "org1", "safe_autopilot");
    mockAnalyzeLead.mockResolvedValue({
      analysis: baseAnalysis({ recommended_action: "reply", human_review_required: false }),
      promptVersion: "v1",
      model: "claude",
      latencyMs: 10,
      usedFallback: false,
      guardrailWarnings: [],
    });

    const result = await createLeadAndAnalyze(db as any, "org1", { name: "A", email: "a@example.com", message: "hi" });

    expect(result.replySent).toBe(true);
    const aiMessage = db.table("messages").find((m) => m.sender === "ai");
    expect(aiMessage?.pending_approval).toBe(false);
    expect(db.table("approvals")).toHaveLength(0);
  });

  it("safe_autopilot still queues an uncertain case for approval", async () => {
    const db = new FakeSupabase();
    seedOrg(db, "org1", "safe_autopilot");
    mockAnalyzeLead.mockResolvedValue({
      analysis: baseAnalysis({ human_review_required: true, human_review_reason: "Complaint detected", recommended_action: "human_handoff" }),
      promptVersion: "v1",
      model: "claude",
      latencyMs: 10,
      usedFallback: false,
      guardrailWarnings: [],
    });

    const result = await createLeadAndAnalyze(db as any, "org1", { name: "A", email: "a@example.com", message: "This is unacceptable, I want a refund" });

    expect(result.replySent).toBe(false);
    const lead = db.table("leads")[0];
    expect(lead?.stage).toBe("human_review");
  });

  it("autopilot auto-sends unless human review is required", async () => {
    const db = new FakeSupabase();
    seedOrg(db, "org1", "autopilot");
    mockAnalyzeLead.mockResolvedValue({
      analysis: baseAnalysis({ human_review_required: true, human_review_reason: "Refund request", recommended_action: "human_handoff" }),
      promptVersion: "v1",
      model: "claude",
      latencyMs: 10,
      usedFallback: false,
      guardrailWarnings: [],
    });

    const result = await createLeadAndAnalyze(db as any, "org1", { name: "A", email: "a@example.com", message: "I want a refund" });
    expect(result.replySent).toBe(false);
    expect(db.table("approvals")).toHaveLength(1);
  });

  it("deduplicates a submission that reuses the same idempotency key", async () => {
    const db = new FakeSupabase();
    seedOrg(db, "org1", "draft");
    mockAnalyzeLead.mockResolvedValue({
      analysis: baseAnalysis(),
      promptVersion: "v1",
      model: "claude",
      latencyMs: 10,
      usedFallback: false,
      guardrailWarnings: [],
    });

    const key = "idem-key-123";
    const first = await createLeadAndAnalyze(db as any, "org1", {
      name: "A",
      email: "a@example.com",
      message: "hi",
      idempotencyKey: key,
    });
    const second = await createLeadAndAnalyze(db as any, "org1", {
      name: "A",
      email: "a@example.com",
      message: "hi again (double click)",
      idempotencyKey: key,
    });

    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.leadId).toBe(first.leadId);
    expect(db.table("leads")).toHaveLength(1);
    expect(mockAnalyzeLead).toHaveBeenCalledTimes(1);
  });

  it("schedules a first follow-up only when a reply is actually auto-sent", async () => {
    const db = new FakeSupabase();
    seedOrg(db, "org1", "autopilot");
    db.seed("followup_settings", [
      { org_id: "org1", first_delay_hours: 24, second_delay_hours: 72, max_followups: 2, allowed_start_hour: 0, allowed_end_hour: 24 },
    ]);
    mockAnalyzeLead.mockResolvedValue({
      analysis: baseAnalysis({ human_review_required: false, recommended_action: "reply" }),
      promptVersion: "v1",
      model: "claude",
      latencyMs: 10,
      usedFallback: false,
      guardrailWarnings: [],
    });

    await createLeadAndAnalyze(db as any, "org1", { name: "A", email: "a@example.com", message: "hi" });
    expect(db.table("followup_jobs")).toHaveLength(1);
  });

  it("does not schedule a follow-up when the lead is routed to human review", async () => {
    const db = new FakeSupabase();
    seedOrg(db, "org1", "autopilot");
    mockAnalyzeLead.mockResolvedValue({
      analysis: baseAnalysis({ human_review_required: true, human_review_reason: "complaint", recommended_action: "human_handoff" }),
      promptVersion: "v1",
      model: "claude",
      latencyMs: 10,
      usedFallback: false,
      guardrailWarnings: [],
    });

    await createLeadAndAnalyze(db as any, "org1", { name: "A", email: "a@example.com", message: "complaint" });
    expect(db.table("followup_jobs")).toHaveLength(0);
  });
});

describe("tenant isolation (application-level scoping)", () => {
  it("never returns another org's leads when queried by org_id", async () => {
    const db = new FakeSupabase();
    seedOrg(db, "orgA", "draft");
    seedOrg(db, "orgB", "draft");
    mockAnalyzeLead.mockResolvedValue({
      analysis: baseAnalysis(),
      promptVersion: "v1",
      model: "claude",
      latencyMs: 10,
      usedFallback: false,
      guardrailWarnings: [],
    });

    await createLeadAndAnalyze(db as any, "orgA", { name: "A lead", email: "a@example.com", message: "hi" });
    await createLeadAndAnalyze(db as any, "orgB", { name: "B lead", email: "b@example.com", message: "hi" });

    const { data: orgALeads } = await db.from("leads").select("*").eq("org_id", "orgA");
    const { data: orgBLeads } = await db.from("leads").select("*").eq("org_id", "orgB");

    expect((orgALeads as any[]).map((l) => l.name)).toEqual(["A lead"]);
    expect((orgBLeads as any[]).map((l) => l.name)).toEqual(["B lead"]);
  });
});

describe("cancelFollowUpsForLead", () => {
  it("cancels only scheduled jobs for the given lead, leaving others untouched", async () => {
    const db = new FakeSupabase();
    db.seed("followup_jobs", [
      { id: "j1", org_id: "org1", lead_id: "lead1", status: "scheduled", attempt_number: 1, run_at: new Date().toISOString(), cancel_reason: null },
      { id: "j2", org_id: "org1", lead_id: "lead1", status: "sent", attempt_number: 0, run_at: new Date().toISOString(), cancel_reason: null },
      { id: "j3", org_id: "org1", lead_id: "lead2", status: "scheduled", attempt_number: 1, run_at: new Date().toISOString(), cancel_reason: null },
    ]);

    await cancelFollowUpsForLead(db as any, "org1", "lead1", "Customer opted out");

    const jobs = db.table("followup_jobs");
    expect(jobs.find((j) => j.id === "j1")?.status).toBe("cancelled");
    expect(jobs.find((j) => j.id === "j2")?.status).toBe("sent");
    expect(jobs.find((j) => j.id === "j3")?.status).toBe("scheduled");
  });
});

describe("scheduleFirstFollowUp", () => {
  it("creates a job respecting configured follow-up settings", async () => {
    const db = new FakeSupabase();
    db.seed("organizations", [{ id: "org1", timezone: "UTC" }]);
    db.seed("followup_settings", [
      { org_id: "org1", first_delay_hours: 48, second_delay_hours: 72, max_followups: 2, allowed_start_hour: 9, allowed_end_hour: 17 },
    ]);

    await scheduleFirstFollowUp(db as any, "org1", "lead1");

    const jobs = db.table("followup_jobs");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.attempt_number).toBe(1);
  });
});
