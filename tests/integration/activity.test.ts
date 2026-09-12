import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { auditRepository } from "../../src/modules/audit/audit.repository.js";
import { approvalRepository } from "../../src/modules/approvals/approvals.repository.js";
import { recordActivity } from "../../src/modules/audit/audit.service.js";
import type { EventType } from "../../src/modules/audit/audit.types.js";

const app = createApp();

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

async function seed(
  eventType: EventType,
  overrides: { leadId?: string | null; userId?: string | null } = {},
) {
  return recordActivity({
    eventType,
    leadId: overrides.leadId === undefined ? "lead_1" : overrides.leadId,
    userId: overrides.userId === undefined ? null : overrides.userId,
    actorType: "AI",
    description: `Something of type ${eventType} happened.`,
    metadata: {},
    requestId: "req_seed",
    subjectType: null,
    subjectId: null,
  });
}

beforeEach(() => {
  auditRepository.clear();
  approvalRepository.clear();
});

describe("GET /api/activity", () => {
  it("returns an empty feed when nothing has happened", async () => {
    const response = await request(app).get("/api/activity");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta.hasMore).toBe(false);
  });

  it("returns every stored field", async () => {
    await seed("LEAD_ANALYZED");

    const response = await request(app).get("/api/activity");
    const entry = response.body.data[0];

    expect(Object.keys(entry).sort()).toEqual([
      "actorType",
      "createdAt",
      "description",
      "eventType",
      "id",
      "leadId",
      "metadata",
      "requestId",
      "subjectId",
      "subjectType",
      "userId",
    ]);
    expect(entry.eventType).toBe("LEAD_ANALYZED");
    expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns newest first", async () => {
    await seed("LEAD_ANALYZED");
    await seed("FOLLOWUP_SUGGESTED");
    await seed("APPROVAL_REQUESTED");

    const response = await request(app).get("/api/activity");
    expect(response.body.data.map((item: { eventType: string }) => item.eventType)).toEqual([
      "APPROVAL_REQUESTED",
      "FOLLOWUP_SUGGESTED",
      "LEAD_ANALYZED",
    ]);
  });

  describe("filtering", () => {
    it("filters by leadId", async () => {
      await seed("LEAD_ANALYZED", { leadId: "lead_a" });
      await seed("LEAD_ANALYZED", { leadId: "lead_b" });

      const response = await request(app).get("/api/activity?leadId=lead_a");
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].leadId).toBe("lead_a");
    });

    it("filters by eventType", async () => {
      await seed("LEAD_ANALYZED");
      await seed("APPROVAL_APPROVED");
      await seed("APPROVAL_APPROVED");

      const response = await request(app).get("/api/activity?eventType=APPROVAL_APPROVED");
      expect(response.body.data).toHaveLength(2);
    });

    it("filters by a single calendar day", async () => {
      await seed("LEAD_ANALYZED");
      const today = new Date().toISOString().slice(0, 10);

      const match = await request(app).get(`/api/activity?date=${today}`);
      expect(match.body.data).toHaveLength(1);

      const other = await request(app).get("/api/activity?date=2020-01-01");
      expect(other.body.data).toEqual([]);
    });

    it("filters by an explicit from/to window", async () => {
      await seed("LEAD_ANALYZED");

      const inside = await request(app).get(
        `/api/activity?from=${hoursAgo(1)}&to=${new Date(Date.now() + 60_000).toISOString()}`,
      );
      expect(inside.body.data).toHaveLength(1);

      const outside = await request(app).get(
        `/api/activity?from=${hoursAgo(48)}&to=${hoursAgo(24)}`,
      );
      expect(outside.body.data).toEqual([]);
    });

    it("combines filters", async () => {
      await seed("LEAD_ANALYZED", { leadId: "lead_a" });
      await seed("APPROVAL_APPROVED", { leadId: "lead_a" });
      await seed("APPROVAL_APPROVED", { leadId: "lead_b" });

      const response = await request(app).get(
        "/api/activity?leadId=lead_a&eventType=APPROVAL_APPROVED",
      );
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].leadId).toBe("lead_a");
    });

    it("paginates with a cursor", async () => {
      for (let index = 0; index < 5; index += 1) {
        await seed("LEAD_ANALYZED");
      }

      const first = await request(app).get("/api/activity?limit=2");
      expect(first.body.data).toHaveLength(2);
      expect(first.body.meta.hasMore).toBe(true);

      const second = await request(app).get(
        `/api/activity?limit=2&cursor=${first.body.meta.nextCursor}`,
      );
      const firstIds = first.body.data.map((item: { id: string }) => item.id);
      const secondIds = second.body.data.map((item: { id: string }) => item.id);
      expect(firstIds.some((id: string) => secondIds.includes(id))).toBe(false);
    });
  });

  describe("query validation", () => {
    it("rejects an unknown event type", async () => {
      const response = await request(app).get("/api/activity?eventType=SOMETHING_ELSE");
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("rejects a malformed date", async () => {
      const response = await request(app).get("/api/activity?date=yesterday");
      expect(response.status).toBe(422);
      expect(JSON.stringify(response.body.error.details)).toMatch(/calendar day/);
    });

    it("rejects a window that ends before it starts", async () => {
      const response = await request(app).get(
        `/api/activity?from=${hoursAgo(1)}&to=${hoursAgo(5)}`,
      );
      expect(response.status).toBe(422);
    });

    it("rejects an out-of-range limit", async () => {
      expect((await request(app).get("/api/activity?limit=0")).status).toBe(422);
      expect((await request(app).get("/api/activity?limit=101")).status).toBe(422);
    });
  });
});

describe("the features feed the activity log", () => {
  it("records LEAD_ANALYZED when an inquiry is analyzed", async () => {
    await request(app)
      .post("/api/leads/analyze")
      .send({
        leadId: "lead_analyzed",
        message: "Hi, I need my apartment cleaned next Friday. Can you tell me the price?",
        companyContext: { businessType: "Cleaning Company" },
      });

    const response = await request(app).get("/api/activity?eventType=LEAD_ANALYZED");
    expect(response.body.data).toHaveLength(1);

    const entry = response.body.data[0];
    expect(entry.leadId).toBe("lead_analyzed");
    expect(entry.actorType).toBe("AI");
    expect(entry.userId).toBeNull();
    expect(entry.description).toMatch(/analyzed an inquiry/i);
    // The customer's own words are never copied into a permanent store.
    expect(JSON.stringify(entry)).not.toMatch(/apartment cleaned next Friday/);
  });

  it("records FOLLOWUP_SUGGESTED when a follow-up is drafted", async () => {
    await request(app)
      .post("/api/followups/suggest")
      .send({
        leadId: "lead_followup",
        messageHistory: [
          { sender: "CUSTOMER", message: "How much for a deep clean?", sentAt: hoursAgo(200) },
        ],
        leadStatus: "CONTACTED",
        leadTemperature: "WARM",
        lastContactAt: hoursAgo(196),
        companyContext: { businessType: "Cleaning Company", timezone: "Europe/Berlin" },
      });

    const response = await request(app).get("/api/activity?eventType=FOLLOWUP_SUGGESTED");
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].leadId).toBe("lead_followup");
    expect(response.body.data[0].metadata.approvalRequired).toBe(true);
  });

  it("records FOLLOWUP_BLOCKED when the rules refuse to chase a customer", async () => {
    await request(app)
      .post("/api/followups/suggest")
      .send({
        leadId: "lead_optout",
        messageHistory: [
          { sender: "CUSTOMER", message: "Please stop contacting me.", sentAt: hoursAgo(200) },
        ],
        leadStatus: "CONTACTED",
        leadTemperature: "HOT",
        lastContactAt: hoursAgo(196),
        companyContext: { businessType: "Cleaning Company" },
      });

    const response = await request(app).get("/api/activity?eventType=FOLLOWUP_BLOCKED");
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].metadata.policyCode).toBe("CUSTOMER_OPTED_OUT");
  });

  it("records the whole approval lifecycle against one lead", async () => {
    const created = await request(app)
      .post("/api/approvals")
      .send({
        leadId: "lead_99",
        customerName: "Anna",
        proposedAction: "SEND_FOLLOW_UP",
        proposedMessage: "Hi Anna, checking in.",
        reason: "No reply in four days.",
        createdBy: "ai",
        actorType: "AI",
      });

    await request(app)
      .post(`/api/approvals/${created.body.data.id}/approve`)
      .send({ decidedBy: "anna@cleaning.example" });

    const feed = await request(app).get("/api/activity?leadId=lead_99");
    const events = feed.body.data.map(
      (item: { eventType: string; userId: string | null }) => [item.eventType, item.userId],
    );

    // Newest first: the human decision, then the AI proposal.
    expect(events).toEqual([
      ["APPROVAL_APPROVED", "anna@cleaning.example"],
      ["APPROVAL_REQUESTED", null],
    ]);
  });

  it("answers 'was that a person or the AI?' for every entry", async () => {
    await request(app)
      .post("/api/approvals")
      .send({
        leadId: "lead_actor",
        customerName: "Anna",
        proposedAction: "CHANGE_LEAD_STATUS",
        reason: "Lead has gone quiet for a month.",
        createdBy: "ai",
        actorType: "AI",
      });

    const feed = await request(app).get("/api/activity?leadId=lead_actor");
    const entry = feed.body.data[0];

    expect(entry.actorType).toBe("AI");
    expect(entry.userId).toBeNull();
  });
});
