import { beforeEach, describe, expect, it } from "vitest";
import { recordActivity, getTrail, listActivity } from "../../src/modules/audit/audit.service.js";
import { auditRepository } from "../../src/modules/audit/audit.repository.js";
import type { NewActivityEntry } from "../../src/modules/audit/audit.types.js";

const entry = (
  overrides: Partial<NewActivityEntry> = {},
): NewActivityEntry => ({
  eventType: "APPROVAL_REQUESTED",
  leadId: "lead_1",
  userId: "anna@example.com",
  actorType: "USER",
  description: "Anna proposed a follow-up.",
  metadata: {},
  requestId: "req_test",
  subjectType: "approval",
  subjectId: "apr_1",
  ...overrides,
});

beforeEach(() => {
  auditRepository.clear();
});

describe("audit service", () => {
  it("stamps each entry with an id and a timestamp", async () => {
    const activity = await recordActivity(entry());

    expect(activity.id).toMatch(/^act_/);
    expect(activity.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(activity.eventType).toBe("APPROVAL_REQUESTED");
  });

  it("stores every field the activity feed needs", async () => {
    const activity = await recordActivity(entry({ metadata: { riskLevel: "HIGH" } }));

    expect(activity).toMatchObject({
      eventType: "APPROVAL_REQUESTED",
      leadId: "lead_1",
      userId: "anna@example.com",
      description: "Anna proposed a follow-up.",
      metadata: { riskLevel: "HIGH" },
      requestId: "req_test",
    });
  });

  it("records a null userId when the AI acted alone", async () => {
    const activity = await recordActivity(
      entry({ actorType: "AI", userId: null, eventType: "LEAD_ANALYZED" }),
    );
    expect(activity.userId).toBeNull();
    expect(activity.actorType).toBe("AI");
  });

  it("redacts secrets before they are stored", async () => {
    const activity = await recordActivity(
      entry({ metadata: { apiKey: "sk-ant-abcdef1234567890", model: "claude-opus-5" } }),
    );

    expect(activity.metadata.apiKey).toBe("[Redacted]");
    expect(activity.metadata.model).toBe("claude-opus-5");
  });

  it("keeps the trail for one subject in the order things happened", async () => {
    await recordActivity(entry({ eventType: "APPROVAL_REQUESTED" }));
    await recordActivity(entry({ eventType: "APPROVAL_APPROVED" }));
    await recordActivity(entry({ subjectId: "apr_2" }));

    const trail = await getTrail("approval", "apr_1");
    expect(trail.map((item) => item.eventType)).toEqual([
      "APPROVAL_REQUESTED",
      "APPROVAL_APPROVED",
    ]);
  });

  it("keeps subjects separate", async () => {
    await recordActivity(entry({ subjectId: "apr_1" }));
    await recordActivity(entry({ subjectId: "apr_2", eventType: "APPROVAL_REJECTED" }));

    expect(await getTrail("approval", "apr_2")).toHaveLength(1);
  });

  it("lists newest first", async () => {
    await recordActivity(entry({ description: "first" }));
    await recordActivity(entry({ description: "second" }));

    const page = await listActivity({ limit: 25 });
    expect(page.items[0]?.description).toBe("second");
  });

  it("exposes no way to change or remove an entry", () => {
    const repository = auditRepository as unknown as Record<string, unknown>;
    for (const method of ["append", "list", "listBySubject", "listAll"]) {
      expect(typeof repository[method]).toBe("function");
    }
    expect(repository.update).toBeUndefined();
    expect(repository.delete).toBeUndefined();
    expect(repository.remove).toBeUndefined();
  });
});
