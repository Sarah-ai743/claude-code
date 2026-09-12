import { describe, expect, it, afterEach } from "vitest";
import { createApp } from "../../src/app.js";
import { authed } from "../helpers/client.js";
import { setAIProvider } from "../../src/ai/providers/index.js";
import type { AIProvider } from "../../src/ai/types.js";

const app = createApp();
// Every request below carries a valid API token — see tests/helpers/client.ts.
const api = authed(app);

const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

const companyContext = {
  businessType: "Cleaning Company",
  services: ["Home Cleaning", "End of Tenancy Cleaning"],
  language: "English",
  tone: "FRIENDLY",
  timezone: "Europe/Berlin",
  businessHours: { startHour: 9, endHour: 17, workingDays: [1, 2, 3, 4, 5] },
};

const validPayload = {
  messageHistory: [
    {
      sender: "CUSTOMER",
      message: "Hi, I need my apartment cleaned next Friday. Can you tell me the price?",
      sentAt: hoursAgo(200),
    },
    {
      sender: "BUSINESS",
      message: "Hi Anna, happy to help. Is it a 3-bedroom apartment?",
      sentAt: hoursAgo(196),
    },
  ],
  leadStatus: "CONTACTED",
  leadTemperature: "WARM",
  lastContactAt: hoursAgo(196),
  customerName: "Anna",
  companyContext,
};

/** Reads the hour and weekday of an instant, in the business's timezone. */
function localParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(iso));
  return {
    hour: Number(parts.find((p) => p.type === "hour")?.value),
    weekday: parts.find((p) => p.type === "weekday")?.value,
  };
}

afterEach(() => {
  setAIProvider(undefined);
});

describe("POST /api/followups/suggest", () => {
  it("suggests a follow-up for a warm lead that has gone quiet", async () => {
    const response = await api.post("/api/followups/suggest").send(validPayload);

    expect(response.status).toBe(200);

    const { data, meta } = response.body;

    expect(Object.keys(data).sort()).toEqual([
      "reason",
      "recommendedFollowUpTime",
      "shouldFollowUp",
      "suggestedMessage",
      "urgency",
    ]);

    expect(data.shouldFollowUp).toBe(true);
    expect(typeof data.reason).toBe("string");
    expect(typeof data.suggestedMessage).toBe("string");
    expect(["HIGH", "MEDIUM", "LOW"]).toContain(data.urgency);
    expect(meta.aiCalled).toBe(true);
  });

  it("schedules inside the business's working hours, in its own timezone", async () => {
    const response = await api.post("/api/followups/suggest").send(validPayload);

    const when = response.body.data.recommendedFollowUpTime;
    expect(when).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const { hour, weekday } = localParts(when, "Europe/Berlin");
    expect(hour).toBeGreaterThanOrEqual(9);
    expect(hour).toBeLessThan(17);
    expect(["Mon", "Tue", "Wed", "Thu", "Fri"]).toContain(weekday);
  });

  it("schedules for the future, never the past", async () => {
    const response = await api.post("/api/followups/suggest").send(validPayload);
    const when = new Date(response.body.data.recommendedFollowUpTime).getTime();
    expect(when).toBeGreaterThan(Date.now());
  });

  it("always marks the draft as needing human approval", async () => {
    const response = await api.post("/api/followups/suggest").send(validPayload);

    expect(response.body.meta.approval).toMatchObject({
      required: true,
      status: "PENDING_HUMAN_APPROVAL",
    });
    expect(response.body.meta.approval.note).toMatch(/nothing has been sent/i);
  });

  describe("customers who asked not to be contacted", () => {
    it("refuses to follow up, and does not call the AI at all", async () => {
      let providerCalls = 0;
      setAIProvider({
        name: "counting",
        async completeStructured() {
          providerCalls += 1;
          throw new Error("the model should never have been consulted");
        },
      });

      const response = await api
        .post("/api/followups/suggest")
        .send({
          ...validPayload,
          messageHistory: [
            ...validPayload.messageHistory,
            {
              sender: "CUSTOMER",
              message: "Please stop contacting me about this.",
              sentAt: hoursAgo(190),
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.shouldFollowUp).toBe(false);
      expect(response.body.data.suggestedMessage).toBeNull();
      expect(response.body.data.recommendedFollowUpTime).toBeNull();
      expect(response.body.meta.policy.code).toBe("CUSTOMER_OPTED_OUT");
      expect(response.body.meta.aiCalled).toBe(false);
      expect(providerCalls).toBe(0);
    });

    it("still refuses when the AI is the one that spots the opt-out", async () => {
      setAIProvider({
        name: "spots-opt-out",
        async completeStructured() {
          return {
            data: {
              shouldFollowUp: true,
              customerOptedOut: true,
              reason: "Customer used wording the rules did not catch.",
              recommendedDelayHours: 24,
              preferredTimeOfDay: "MORNING",
              suggestedMessage: "Hi, just checking in!",
              urgency: "HIGH",
            },
            model: "stub",
            latencyMs: 1,
            usage: { inputTokens: 0, outputTokens: 0 },
          } as never;
        },
      } as AIProvider);

      const response = await api.post("/api/followups/suggest").send(validPayload);

      expect(response.body.data.shouldFollowUp).toBe(false);
      expect(response.body.data.suggestedMessage).toBeNull();
      expect(response.body.meta.policy.code).toBe("CUSTOMER_OPTED_OUT");
    });
  });

  it("refuses to follow up too soon after the last contact", async () => {
    const response = await api
      .post("/api/followups/suggest")
      .send({ ...validPayload, leadTemperature: "HOT", lastContactAt: hoursAgo(2) });

    expect(response.body.data.shouldFollowUp).toBe(false);
    expect(response.body.meta.policy.code).toBe("TOO_SOON");
    expect(response.body.meta.policy.earliestAllowedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(response.body.meta.aiCalled).toBe(false);
  });

  it("stops after three unanswered messages", async () => {
    const response = await api
      .post("/api/followups/suggest")
      .send({
        ...validPayload,
        messageHistory: [
          { sender: "CUSTOMER", message: "Hi, how much for a clean?", sentAt: hoursAgo(300) },
          { sender: "BUSINESS", message: "Here is our quote.", sentAt: hoursAgo(290) },
          { sender: "BUSINESS", message: "Just checking in.", sentAt: hoursAgo(240) },
          { sender: "BUSINESS", message: "Following up again.", sentAt: hoursAgo(196) },
        ],
      });

    expect(response.body.data.shouldFollowUp).toBe(false);
    expect(response.body.meta.policy.code).toBe("TOO_MANY_UNANSWERED");
  });

  it("does not chase a lost lead", async () => {
    const response = await api
      .post("/api/followups/suggest")
      .send({ ...validPayload, leadStatus: "LOST" });

    expect(response.body.data.shouldFollowUp).toBe(false);
    expect(response.body.meta.policy.code).toBe("LEAD_CLOSED_LOST");
  });

  it("never lets the AI enable a follow-up that policy blocked", async () => {
    setAIProvider({
      name: "eager",
      async completeStructured() {
        return {
          data: {
            shouldFollowUp: true,
            customerOptedOut: false,
            reason: "I really think we should message them.",
            recommendedDelayHours: 1,
            preferredTimeOfDay: "MORNING",
            suggestedMessage: "Hi! Just checking in again!",
            urgency: "HIGH",
          },
          model: "stub",
          latencyMs: 1,
          usage: { inputTokens: 0, outputTokens: 0 },
        } as never;
      },
    } as AIProvider);

    const response = await api
      .post("/api/followups/suggest")
      .send({ ...validPayload, leadTemperature: "HOT", lastContactAt: hoursAgo(1) });

    expect(response.body.data.shouldFollowUp).toBe(false);
    expect(response.body.meta.policy.code).toBe("TOO_SOON");
  });

  describe("validation", () => {
    it("rejects an empty message history", async () => {
      const response = await api
        .post("/api/followups/suggest")
        .send({ ...validPayload, messageHistory: [] });

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("rejects an unknown lead status", async () => {
      const response = await api
        .post("/api/followups/suggest")
        .send({ ...validPayload, leadStatus: "MAYBE" });

      expect(response.status).toBe(422);
    });

    it("rejects an invalid timezone", async () => {
      const response = await api
        .post("/api/followups/suggest")
        .send({
          ...validPayload,
          companyContext: { ...companyContext, timezone: "Mars/Olympus_Mons" },
        });

      expect(response.status).toBe(422);
      expect(JSON.stringify(response.body.error.details)).toMatch(/IANA/);
    });

    it("rejects a non-ISO timestamp", async () => {
      const response = await api
        .post("/api/followups/suggest")
        .send({ ...validPayload, lastContactAt: "last Tuesday" });

      expect(response.status).toBe(422);
    });

    it("rejects closing hours that precede opening hours", async () => {
      const response = await api
        .post("/api/followups/suggest")
        .send({
          ...validPayload,
          companyContext: {
            ...companyContext,
            businessHours: { startHour: 17, endHour: 9, workingDays: [1] },
          },
        });

      expect(response.status).toBe(422);
    });

    it("applies defaults for tone, timezone and business hours", async () => {
      const response = await api
        .post("/api/followups/suggest")
        .send({
          ...validPayload,
          companyContext: { businessType: "Cleaning Company" },
        });

      expect(response.status).toBe(200);
      expect(response.body.meta.policy.timezone).toBe("UTC");
    });
  });
});
