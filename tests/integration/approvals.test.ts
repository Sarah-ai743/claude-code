import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { authed } from "../helpers/client.js";
import { approvalRepository } from "../../src/modules/approvals/approvals.repository.js";
import { auditRepository } from "../../src/modules/audit/audit.repository.js";

const app = createApp();
// Every request below carries a valid API token — see tests/helpers/client.ts.
const api = authed(app);

const proposal = {
  leadId: "lead_123",
  customerName: "Anna",
  proposedAction: "SEND_FOLLOW_UP",
  proposedMessage: "Hi Anna, just checking you have everything you need from us.",
  reason: "The customer asked about pricing four days ago and has not had a reply.",
  createdBy: "ai",
  actorType: "AI",
};

async function createProposal(overrides: Record<string, unknown> = {}) {
  const response = await api
    .post("/api/approvals")
    .send({ ...proposal, ...overrides });
  return response;
}

beforeEach(() => {
  // Storage is in-process for now, so each test starts from an empty queue.
  approvalRepository.clear();
  auditRepository.clear();
});

describe("POST /api/approvals", () => {
  it("creates a pending item with every required field", async () => {
    const response = await createProposal();

    expect(response.status).toBe(201);

    const { data } = response.body;
    expect(data.id).toMatch(/^apr_/);
    expect(data.leadId).toBe("lead_123");
    expect(data.customerName).toBe("Anna");
    expect(data.proposedAction).toBe("SEND_FOLLOW_UP");
    expect(data.proposedMessage).toBe(proposal.proposedMessage);
    expect(data.reason).toBe(proposal.reason);
    expect(data.riskLevel).toBe("HIGH");
    expect(data.status).toBe("PENDING");
    expect(data.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data.decidedAt).toBeNull();
    expect(data.decidedBy).toBeNull();
  });

  it("derives a risk level from the action when none is given", async () => {
    const internal = await createProposal({
      proposedAction: "CHANGE_LEAD_STATUS",
      proposedMessage: undefined,
    });
    expect(internal.body.data.riskLevel).toBe("LOW");

    const meeting = await createProposal({ proposedAction: "BOOK_MEETING" });
    expect(meeting.body.data.riskLevel).toBe("MEDIUM");
  });

  it("lets the caller override the risk level", async () => {
    const response = await createProposal({
      proposedAction: "CHANGE_LEAD_STATUS",
      riskLevel: "HIGH",
    });
    expect(response.body.data.riskLevel).toBe("HIGH");
  });

  it("writes an audit entry for the creation", async () => {
    const response = await createProposal();
    const trail = await auditRepository.listBySubject("approval", response.body.data.id);

    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({
      eventType: "APPROVAL_REQUESTED",
      actorType: "AI",
      userId: null,
      leadId: "lead_123",
    });
  });

  describe("validation", () => {
    it("rejects an unknown action", async () => {
      const response = await createProposal({ proposedAction: "LAUNCH_ROCKET" });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("rejects a missing leadId", async () => {
      const response = await api
        .post("/api/approvals")
        .send({ ...proposal, leadId: undefined });
      expect(response.status).toBe(422);
    });

    it("requires a reason", async () => {
      const response = await createProposal({ reason: "x" });
      expect(response.status).toBe(422);
      expect(JSON.stringify(response.body.error.details)).toMatch(/reason/);
    });

    it("rejects an unknown risk level", async () => {
      const response = await createProposal({ riskLevel: "CATASTROPHIC" });
      expect(response.status).toBe(422);
    });
  });
});

describe("GET /api/approvals", () => {
  it("returns an empty list when the queue is empty", async () => {
    const response = await api.get("/api/approvals");
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta.hasMore).toBe(false);
  });

  it("returns items newest first", async () => {
    const first = await createProposal({ customerName: "First" });
    const second = await createProposal({ customerName: "Second" });

    const response = await api.get("/api/approvals");
    const ids = response.body.data.map((item: { id: string }) => item.id);

    expect(ids).toHaveLength(2);
    expect(ids).toContain(first.body.data.id);
    expect(ids[0]).toBe(second.body.data.id);
  });

  it("filters by status", async () => {
    const toReject = await createProposal();
    await createProposal();

    await api
      .post(`/api/approvals/${toReject.body.data.id}/reject`)
      .send({ decidedBy: "anna@example.com", reason: "Too soon after the last message." });

    const pending = await api.get("/api/approvals?status=PENDING");
    expect(pending.body.data).toHaveLength(1);

    const rejected = await api.get("/api/approvals?status=REJECTED");
    expect(rejected.body.data).toHaveLength(1);
    expect(rejected.body.data[0].id).toBe(toReject.body.data.id);
  });

  it("filters by risk level and by lead", async () => {
    await createProposal({ leadId: "lead_a", proposedAction: "CHANGE_LEAD_STATUS" });
    await createProposal({ leadId: "lead_b" });

    const high = await api.get("/api/approvals?riskLevel=HIGH");
    expect(high.body.data).toHaveLength(1);
    expect(high.body.data[0].leadId).toBe("lead_b");

    const byLead = await api.get("/api/approvals?leadId=lead_a");
    expect(byLead.body.data).toHaveLength(1);
  });

  it("paginates with a cursor", async () => {
    for (let index = 0; index < 5; index += 1) {
      await createProposal({ customerName: `Customer ${index}` });
    }

    const firstPage = await api.get("/api/approvals?limit=2");
    expect(firstPage.body.data).toHaveLength(2);
    expect(firstPage.body.meta.hasMore).toBe(true);

    const secondPage = await api.get(
      `/api/approvals?limit=2&cursor=${firstPage.body.meta.nextCursor}`,
    );
    expect(secondPage.body.data).toHaveLength(2);

    const firstIds = firstPage.body.data.map((item: { id: string }) => item.id);
    const secondIds = secondPage.body.data.map((item: { id: string }) => item.id);
    expect(firstIds.some((id: string) => secondIds.includes(id))).toBe(false);
  });

  it("rejects an invalid query", async () => {
    const response = await api.get("/api/approvals?status=MAYBE");
    expect(response.status).toBe(422);
    expect(response.body.error.message).toMatch(/query string/i);
  });

  it("rejects an out-of-range limit", async () => {
    const response = await api.get("/api/approvals?limit=5000");
    expect(response.status).toBe(422);
  });
});

describe("POST /api/approvals/:id/approve", () => {
  it("approves a pending item and records who decided", async () => {
    const created = await createProposal();

    const response = await api
      .post(`/api/approvals/${created.body.data.id}/approve`)
      .send({ decidedBy: "anna@example.com", note: "Looks good." });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("APPROVED");
    expect(response.body.data.decidedBy).toBe("anna@example.com");
    expect(response.body.data.decisionNote).toBe("Looks good.");
    expect(response.body.data.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("executes nothing, and says so", async () => {
    const created = await createProposal();
    const response = await api
      .post(`/api/approvals/${created.body.data.id}/approve`)
      .send({ decidedBy: "anna@example.com" });

    expect(response.body.meta.execution.status).toBe("NOT_IMPLEMENTED");
    expect(response.body.meta.execution.note).toMatch(/no email/i);
  });

  it("keeps the original message when a human edits it", async () => {
    const created = await createProposal();
    const edited = "Hi Anna — following up on the quote. Does Friday still work?";

    const response = await api
      .post(`/api/approvals/${created.body.data.id}/approve`)
      .send({ decidedBy: "anna@example.com", editedMessage: edited });

    // Both versions survive: the difference is the quality signal.
    expect(response.body.data.proposedMessage).toBe(proposal.proposedMessage);
    expect(response.body.data.approvedMessage).toBe(edited);

    const trail = await auditRepository.listBySubject("approval", created.body.data.id);
    expect(trail.at(-1)?.metadata).toMatchObject({ messageEdited: true, executed: false });
  });

  it("returns the full audit trail with the decision", async () => {
    const created = await createProposal();
    const response = await api
      .post(`/api/approvals/${created.body.data.id}/approve`)
      .send({ decidedBy: "anna@example.com" });

    expect(
      response.body.data.history.map((item: { eventType: string }) => item.eventType),
    ).toEqual(["APPROVAL_REQUESTED", "APPROVAL_APPROVED"]);
  });

  it("refuses to approve the same item twice", async () => {
    const created = await createProposal();
    const url = `/api/approvals/${created.body.data.id}/approve`;

    await api.post(url).send({ decidedBy: "anna@example.com" });
    const second = await api.post(url).send({ decidedBy: "anna@example.com" });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CONFLICT");
  });

  it("refuses to approve something already rejected", async () => {
    const created = await createProposal();
    await api
      .post(`/api/approvals/${created.body.data.id}/reject`)
      .send({ decidedBy: "anna@example.com", reason: "Not appropriate for this customer." });

    const response = await api
      .post(`/api/approvals/${created.body.data.id}/approve`)
      .send({ decidedBy: "anna@example.com" });

    expect(response.status).toBe(409);
  });

  it("returns 404 for an unknown id", async () => {
    const response = await api
      .post("/api/approvals/apr_does_not_exist/approve")
      .send({ decidedBy: "anna@example.com" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/approvals/:id/reject", () => {
  it("rejects a pending item and keeps the reason", async () => {
    const created = await createProposal();

    const response = await api
      .post(`/api/approvals/${created.body.data.id}/reject`)
      .send({ decidedBy: "anna@example.com", reason: "Customer already replied elsewhere." });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("REJECTED");
    expect(response.body.data.decisionNote).toBe("Customer already replied elsewhere.");
    expect(response.body.data.approvedMessage).toBeNull();
  });

  it("requires a reason", async () => {
    const created = await createProposal();
    const response = await api
      .post(`/api/approvals/${created.body.data.id}/reject`)
      .send({ decidedBy: "anna@example.com" });

    expect(response.status).toBe(422);
    expect(JSON.stringify(response.body.error.details)).toMatch(/reason/);
  });

  it("writes the rejection to the audit trail", async () => {
    const created = await createProposal();
    await api
      .post(`/api/approvals/${created.body.data.id}/reject`)
      .send({ decidedBy: "anna@example.com", reason: "Wrong tone for this customer." });

    const trail = await auditRepository.listBySubject("approval", created.body.data.id);
    expect(trail.map((item) => item.eventType)).toEqual([
      "APPROVAL_REQUESTED",
      "APPROVAL_REJECTED",
    ]);
    expect(trail.at(-1)?.metadata).toMatchObject({ reason: "Wrong tone for this customer." });
  });

  it("refuses to reject a decided item", async () => {
    const created = await createProposal();
    const url = `/api/approvals/${created.body.data.id}/reject`;
    const body = { decidedBy: "anna@example.com", reason: "Not needed." };

    await api.post(url).send(body);
    const second = await api.post(url).send(body);

    expect(second.status).toBe(409);
  });
});

describe("the audit trail as a whole", () => {
  it("never loses an entry, even after a decision changes the record", async () => {
    const created = await createProposal();
    await api
      .post(`/api/approvals/${created.body.data.id}/approve`)
      .send({ decidedBy: "anna@example.com", editedMessage: "Edited before sending." });

    const all = await auditRepository.listAll();
    expect(all).toHaveLength(2);
    // The creating entry still describes the original state.
    expect(all[0]?.eventType).toBe("APPROVAL_REQUESTED");
    expect(all[1]?.eventType).toBe("APPROVAL_APPROVED");
  });

  it("ties every entry back to the HTTP request that caused it", async () => {
    const created = await createProposal();
    const trail = await auditRepository.listBySubject("approval", created.body.data.id);

    expect(trail[0]?.requestId).toBe(created.body.meta.requestId);
  });
});
