import { beforeEach, describe, expect, it } from "vitest";
import { recordActivity, getTrail } from "../../src/modules/audit/audit.service.js";
import { auditRepository } from "../../src/modules/audit/audit.repository.js";

const entry = (action: string, subjectId = "apr_1") => ({
  actorType: "USER" as const,
  actorId: "anna@example.com",
  action,
  subjectType: "approval",
  subjectId,
  metadata: {},
  requestId: "req_test",
});

beforeEach(() => {
  auditRepository.clear();
});

describe("audit service", () => {
  it("stamps each entry with an id and a timestamp", async () => {
    const activity = await recordActivity(entry("approval.created"));

    expect(activity.id).toMatch(/^act_/);
    expect(activity.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(activity.action).toBe("approval.created");
  });

  it("keeps the trail for one subject in the order things happened", async () => {
    await recordActivity(entry("approval.created"));
    await recordActivity(entry("approval.approved"));
    await recordActivity(entry("approval.created", "apr_2"));

    const trail = await getTrail("approval", "apr_1");
    expect(trail.map((item) => item.action)).toEqual([
      "approval.created",
      "approval.approved",
    ]);
  });

  it("keeps subjects separate", async () => {
    await recordActivity(entry("approval.created", "apr_1"));
    await recordActivity(entry("approval.rejected", "apr_2"));

    expect(await getTrail("approval", "apr_2")).toHaveLength(1);
  });

  it("records who acted and which request caused it", async () => {
    const activity = await recordActivity(entry("approval.approved"));
    expect(activity.actorType).toBe("USER");
    expect(activity.actorId).toBe("anna@example.com");
    expect(activity.requestId).toBe("req_test");
  });

  it("exposes no way to change or remove an entry", () => {
    // The interface a database will implement has append and read methods only.
    const methods = ["append", "listBySubject", "listAll"];
    for (const method of methods) {
      expect(typeof (auditRepository as unknown as Record<string, unknown>)[method]).toBe(
        "function",
      );
    }
    const repository = auditRepository as unknown as Record<string, unknown>;
    expect(repository.update).toBeUndefined();
    expect(repository.delete).toBeUndefined();
  });
});
