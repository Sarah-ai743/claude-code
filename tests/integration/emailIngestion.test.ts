import { beforeEach, describe, expect, it, afterEach } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { authed, postSignedWebhook, TEST_WEBHOOK_SECRET } from "../helpers/client.js";
import { leadRepository } from "../../src/modules/leads/leads.repository.js";
import { processedEmailRepository } from "../../src/modules/emails/emails.repository.js";
import { auditRepository } from "../../src/modules/audit/audit.repository.js";
import { approvalRepository } from "../../src/modules/approvals/approvals.repository.js";
import { setAIProvider } from "../../src/ai/providers/index.js";
import type { AIProvider } from "../../src/ai/types.js";

const app = createApp();
const api = authed(app);

const INBOUND = "/api/emails/inbound";

function email(overrides: Record<string, unknown> = {}) {
  return {
    messageId: `msg-${Math.random().toString(36).slice(2)}@mail.example`,
    from: { email: "anna@example.com", name: "Anna Schmidt" },
    to: "hello@yourcleaning.example",
    subject: "Cleaning quote for next Friday?",
    textBody:
      "Hi, I need my apartment cleaned next Friday. It has 3 bedrooms. " +
      "Can you tell me the price?",
    receivedAt: new Date().toISOString(),
    attachments: [],
    ...overrides,
  };
}

async function activityTypes() {
  const all = await auditRepository.listAll();
  return all.map((entry) => entry.eventType);
}

beforeEach(() => {
  leadRepository.clear();
  processedEmailRepository.clear();
  auditRepository.clear();
  approvalRepository.clear();
});

afterEach(() => {
  setAIProvider(undefined);
});

describe("a new email creates a lead", () => {
  it("processes the email end to end", async () => {
    const response = await postSignedWebhook(app, INBOUND, email());

    expect(response.status).toBe(200);
    expect(response.body.data.outcome).toBe("PROCESSED");
    expect(response.body.data.leadCreated).toBe(true);
    expect(response.body.data.leadId).toMatch(/^lead_/);
  });

  it("stores the lead with the sender's details", async () => {
    await postSignedWebhook(app, INBOUND, email());

    const leads = await leadRepository.list();
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      email: "anna@example.com",
      name: "Anna Schmidt",
      source: "EMAIL",
      status: "NEW",
      messageCount: 1,
    });
  });

  it("matches the sender case-insensitively", async () => {
    await postSignedWebhook(app, INBOUND, email());
    await postSignedWebhook(
      app,
      INBOUND,
      email({ from: { email: "ANNA@Example.COM ", name: "Anna" } }),
    );

    expect(await leadRepository.list()).toHaveLength(1);
  });

  it("stores every analysis field on the lead", async () => {
    await postSignedWebhook(app, INBOUND, email());
    const [lead] = await leadRepository.list();

    expect(lead?.temperature).toMatch(/HOT|WARM|COLD/);
    expect(lead?.urgency).toMatch(/HIGH|MEDIUM|LOW/);
    expect(typeof lead?.intent).toBe("string");
    expect(typeof lead?.mainNeed).toBe("string");
    expect(typeof lead?.recommendedAction).toBe("string");
    expect(typeof lead?.suggestedReply).toBe("string");
    expect(lead?.confidence).toBeGreaterThanOrEqual(0);
  });

  it("writes the expected activity trail", async () => {
    await postSignedWebhook(app, INBOUND, email());

    expect(await activityTypes()).toEqual([
      "LEAD_CREATED_FROM_EMAIL",
      "EMAIL_RECEIVED",
      "LEAD_ANALYZED",
      "REPLY_GENERATED",
      "APPROVAL_REQUESTED",
    ]);
  });

  it("ties every entry to the lead, so a per-lead feed is complete", async () => {
    const response = await postSignedWebhook(app, INBOUND, email());
    const leadId = response.body.data.leadId;

    const all = await auditRepository.listAll();
    // Every entry belongs to this lead — nothing falls outside the lead's story.
    expect(all.every((entry) => entry.leadId === leadId)).toBe(true);
    expect(all.map((entry) => entry.eventType)).toContain("EMAIL_RECEIVED");
  });

  it("never sends anything", async () => {
    const response = await postSignedWebhook(app, INBOUND, email());

    expect(response.body.meta.replySent).toBe(false);
    const reply = (await auditRepository.listAll()).find(
      (entry) => entry.eventType === "REPLY_GENERATED",
    );
    expect(reply?.metadata.sent).toBe(false);
  });
});

describe("an existing sender links to the existing lead", () => {
  it("does not create a second lead", async () => {
    await postSignedWebhook(app, INBOUND, email());
    const second = await postSignedWebhook(
      app,
      INBOUND,
      email({ subject: "Following up on my question" }),
    );

    expect(second.body.data.leadCreated).toBe(false);
    expect(await leadRepository.list()).toHaveLength(1);
  });

  it("counts the messages and keeps the same lead id", async () => {
    const first = await postSignedWebhook(app, INBOUND, email());
    const second = await postSignedWebhook(app, INBOUND, email());

    expect(second.body.data.leadId).toBe(first.body.data.leadId);
    const [lead] = await leadRepository.list();
    expect(lead?.messageCount).toBe(2);
  });

  it("records EMAIL_LINKED_TO_LEAD rather than creating one", async () => {
    await postSignedWebhook(app, INBOUND, email());
    auditRepository.clear();
    await postSignedWebhook(app, INBOUND, email());

    const types = await activityTypes();
    expect(types).toContain("EMAIL_LINKED_TO_LEAD");
    expect(types).not.toContain("LEAD_CREATED_FROM_EMAIL");
  });

  it("keeps a name it already knew when a later email has none", async () => {
    await postSignedWebhook(app, INBOUND, email());
    await postSignedWebhook(app, INBOUND, email({ from: { email: "anna@example.com" } }));

    const [lead] = await leadRepository.list();
    expect(lead?.name).toBe("Anna Schmidt");
  });
});

describe("a duplicate email is ignored", () => {
  it("processes the same message id only once", async () => {
    const payload = email();

    const first = await postSignedWebhook(app, INBOUND, payload);
    const second = await postSignedWebhook(app, INBOUND, payload);

    expect(first.body.data.outcome).toBe("PROCESSED");
    expect(second.body.data.outcome).toBe("DUPLICATE_IGNORED");
  });

  it("creates no second lead, analysis or approval", async () => {
    const payload = email();
    await postSignedWebhook(app, INBOUND, payload);
    const countBefore = (await auditRepository.listAll()).length;

    await postSignedWebhook(app, INBOUND, payload);

    expect(await leadRepository.list()).toHaveLength(1);
    const approvals = await approvalRepository.list({ limit: 50 });
    expect(approvals.items).toHaveLength(1);

    // Exactly one new entry: the record that a duplicate was ignored.
    const all = await auditRepository.listAll();
    expect(all).toHaveLength(countBefore + 1);
    expect(all.at(-1)?.eventType).toBe("EMAIL_DUPLICATE_IGNORED");
  });

  it("still answers 200, so the provider stops retrying", async () => {
    const payload = email();
    await postSignedWebhook(app, INBOUND, payload);
    const second = await postSignedWebhook(app, INBOUND, payload);

    expect(second.status).toBe(200);
  });
});

describe("a malformed payload is refused", () => {
  it("rejects a missing sender address", async () => {
    const { from, ...rest } = email();
    const response = await postSignedWebhook(app, INBOUND, rest);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects an invalid email address", async () => {
    const response = await postSignedWebhook(
      app,
      INBOUND,
      email({ from: { email: "not-an-address" } }),
    );
    expect(response.status).toBe(422);
  });

  it.each([
    ["messageId", { messageId: "" }],
    ["textBody", { textBody: "" }],
    ["receivedAt", { receivedAt: "last Tuesday" }],
  ])("rejects a bad %s", async (_field, override) => {
    const response = await postSignedWebhook(app, INBOUND, email(override));
    expect(response.status).toBe(422);
  });

  it("creates nothing at all from a malformed payload", async () => {
    await postSignedWebhook(app, INBOUND, { nonsense: true });

    expect(await leadRepository.list()).toHaveLength(0);
    expect(await auditRepository.listAll()).toHaveLength(0);
  });
});

describe("an analysis failure does not lose the email", () => {
  beforeEach(() => {
    setAIProvider({
      name: "broken",
      async completeStructured() {
        throw new Error("the model is unreachable");
      },
    } as AIProvider);
  });

  it("still creates the lead", async () => {
    const response = await postSignedWebhook(app, INBOUND, email());

    expect(response.status).toBe(200);
    expect(response.body.data.outcome).toBe("RECEIVED_ANALYSIS_FAILED");
    expect(await leadRepository.list()).toHaveLength(1);
  });

  it("records the failure in the activity log", async () => {
    await postSignedWebhook(app, INBOUND, email());

    const types = await activityTypes();
    expect(types).toContain("EMAIL_RECEIVED");
    expect(types).toContain("LEAD_CREATED_FROM_EMAIL");
    expect(types).toContain("LEAD_ANALYSIS_FAILED");
  });

  it("drafts nothing and asks for no approval", async () => {
    await postSignedWebhook(app, INBOUND, email());

    expect(await activityTypes()).not.toContain("REPLY_GENERATED");
    const approvals = await approvalRepository.list({ limit: 50 });
    expect(approvals.items).toHaveLength(0);
  });

  it("does not leak the upstream error text to the caller or the log", async () => {
    const response = await postSignedWebhook(app, INBOUND, email());
    const activity = await auditRepository.listAll();

    expect(JSON.stringify(response.body)).not.toContain("unreachable");
    expect(JSON.stringify(activity)).not.toContain("unreachable");
  });
});

describe("an approval request is created instead of a reply", () => {
  it("queues the draft for a human", async () => {
    const response = await postSignedWebhook(app, INBOUND, email());

    expect(response.body.data.approvalId).toMatch(/^apr_/);

    const approvals = await approvalRepository.list({ limit: 50 });
    expect(approvals.items[0]).toMatchObject({
      proposedAction: "SEND_EMAIL",
      status: "PENDING",
      riskLevel: "HIGH",
    });
  });

  it("puts the drafted reply in the approval, unsent", async () => {
    await postSignedWebhook(app, INBOUND, email());

    const approvals = await approvalRepository.list({ limit: 50 });
    const approval = approvals.items[0];
    const [lead] = await leadRepository.list();

    expect(approval?.proposedMessage).toBe(lead?.suggestedReply);
    expect(approval?.decidedAt).toBeNull();
  });

  it("shows up in the approvals queue the human already uses", async () => {
    await postSignedWebhook(app, INBOUND, email());

    const queue = await api.get("/api/approvals?status=PENDING");
    expect(queue.status).toBe(200);
    expect(queue.body.data).toHaveLength(1);
  });
});

describe("the webhook is protected", () => {
  it("refuses a request with no signature", async () => {
    const response = await request(app).post(INBOUND).send(email());

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("MISSING_WEBHOOK_SIGNATURE");
  });

  it("refuses a wrong signature", async () => {
    const response = await request(app)
      .post(INBOUND)
      .set("X-Webhook-Signature", "a".repeat(64))
      .send(email());

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_WEBHOOK_SIGNATURE");
  });

  it("refuses a signature computed over a different body", async () => {
    const { createHmac } = await import("node:crypto");
    const signature = createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(JSON.stringify(email()))
      .digest("hex");

    // Correct secret, but the body was swapped after signing.
    const response = await request(app)
      .post(INBOUND)
      .set("Content-Type", "application/json")
      .set("X-Webhook-Signature", signature)
      .send(JSON.stringify(email({ from: { email: "attacker@evil.example" } })));

    expect(response.status).toBe(401);
  });

  it("does not need the API token — a mail provider cannot know it", async () => {
    const response = await postSignedWebhook(app, INBOUND, email());
    expect(response.status).toBe(200);
  });

  it("creates nothing when the signature is bad", async () => {
    await request(app).post(INBOUND).set("X-Webhook-Signature", "bad").send(email());

    expect(await leadRepository.list()).toHaveLength(0);
    expect(await auditRepository.listAll()).toHaveLength(0);
  });
});

describe("sensitive content stays out of the permanent log", () => {
  it("never copies the email body into an activity entry", async () => {
    await postSignedWebhook(
      app,
      INBOUND,
      email({ textBody: "My door code is 4821 and my phone is 0170 1234567." }),
    );

    const activity = JSON.stringify(await auditRepository.listAll());
    expect(activity).not.toContain("4821");
    expect(activity).not.toContain("0170 1234567");
  });

  it("records attachment metadata only, never content", async () => {
    await postSignedWebhook(
      app,
      INBOUND,
      email({
        attachments: [{ filename: "floorplan.pdf", contentType: "application/pdf", size: 20481 }],
      }),
    );

    const received = (await auditRepository.listAll()).find(
      (entry) => entry.eventType === "EMAIL_RECEIVED",
    );
    expect(received?.metadata.attachmentCount).toBe(1);
    expect(JSON.stringify(received?.metadata)).not.toContain("floorplan");
  });
});
