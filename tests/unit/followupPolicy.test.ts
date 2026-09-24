import { describe, it, expect } from "vitest";
import {
  checkFollowUpPolicy,
  detectOptOut,
  detectDeclined,
  countUnansweredBusinessMessages,
  computeNextFollowUpTime,
} from "@/lib/followupPolicy";
import { DEFAULT_BUSINESS_HOURS, instantFromWallClock } from "@/lib/businessTime";

const baseInput = {
  messages: [
    { sender: "customer" as const, content: "Hi, I need a quote." },
    { sender: "ai" as const, content: "Sure, can you tell me more?" },
  ],
  leadStage: "needs_information" as const,
  optedOut: false,
  attemptNumber: 1,
  maxFollowups: 2,
  lastContactAt: new Date(Date.now() - 100 * 60 * 60 * 1000),
  now: new Date(),
  minQuietHours: 24,
  allowedStartHour: 0,
  allowedEndHour: 24,
  timeZone: "UTC",
};

describe("followupPolicy: opt-out and decline detection", () => {
  it("detects common opt-out phrasing", () => {
    expect(detectOptOut([{ sender: "customer", content: "Please unsubscribe me" }])).toBe(true);
    expect(detectOptOut([{ sender: "customer", content: "Stop contacting me please" }])).toBe(true);
    expect(detectOptOut([{ sender: "customer", content: "Do not email me again" }])).toBe(true);
    expect(detectOptOut([{ sender: "customer", content: "Sounds great, thanks!" }])).toBe(false);
  });

  it("ignores opt-out phrasing from the business itself", () => {
    expect(detectOptOut([{ sender: "ai", content: "Reply STOP to unsubscribe" }])).toBe(false);
  });

  it("detects a declined lead", () => {
    expect(detectDeclined([{ sender: "customer", content: "We already hired someone else" }])).toBe(true);
    expect(detectDeclined([{ sender: "customer", content: "Not interested anymore, thanks" }])).toBe(true);
  });
});

describe("followupPolicy: checkFollowUpPolicy", () => {
  it("allows a follow-up when nothing blocks it", () => {
    expect(checkFollowUpPolicy(baseInput)).toBeNull();
  });

  it("blocks when the customer opted out", () => {
    const result = checkFollowUpPolicy({ ...baseInput, optedOut: true });
    expect(result?.code).toBe("CUSTOMER_OPTED_OUT");
  });

  it("blocks when the customer's message contains an opt-out phrase", () => {
    const result = checkFollowUpPolicy({
      ...baseInput,
      messages: [{ sender: "customer", content: "please stop emailing me" }],
    });
    expect(result?.code).toBe("CUSTOMER_OPTED_OUT");
  });

  it("blocks for won/lost/human_review stages", () => {
    expect(checkFollowUpPolicy({ ...baseInput, leadStage: "won" })?.code).toBe("LEAD_STAGE_BLOCKS_FOLLOWUP");
    expect(checkFollowUpPolicy({ ...baseInput, leadStage: "lost" })?.code).toBe("LEAD_STAGE_BLOCKS_FOLLOWUP");
    expect(checkFollowUpPolicy({ ...baseInput, leadStage: "human_review" })?.code).toBe(
      "LEAD_STAGE_BLOCKS_FOLLOWUP",
    );
  });

  it("blocks once the maximum follow-up count is reached", () => {
    const result = checkFollowUpPolicy({ ...baseInput, attemptNumber: 2, maxFollowups: 2 });
    expect(result?.code).toBe("MAX_FOLLOWUPS_REACHED");
  });

  it("blocks after too many unanswered business messages", () => {
    const result = checkFollowUpPolicy({
      ...baseInput,
      messages: [
        { sender: "customer", content: "hi" },
        { sender: "ai", content: "1" },
        { sender: "ai", content: "2" },
        { sender: "ai", content: "3" },
      ],
    });
    expect(result?.code).toBe("TOO_MANY_UNANSWERED");
  });

  it("blocks when the quiet period hasn't elapsed", () => {
    const result = checkFollowUpPolicy({ ...baseInput, lastContactAt: new Date(Date.now() - 1000), minQuietHours: 24 });
    expect(result?.code).toBe("TOO_SOON");
    expect(result?.earliestAllowedAt).toBeInstanceOf(Date);
  });

  it("blocks outside allowed communication hours", () => {
    const threeAmUtc = instantFromWallClock({ year: 2026, month: 6, day: 16, hour: 3, minute: 0 }, "UTC");
    const result = checkFollowUpPolicy({
      ...baseInput,
      now: threeAmUtc,
      lastContactAt: new Date(threeAmUtc.getTime() - 100 * 60 * 60 * 1000),
      allowedStartHour: 9,
      allowedEndHour: 18,
    });
    expect(result?.code).toBe("OUTSIDE_ALLOWED_HOURS");
  });
});

describe("followupPolicy: countUnansweredBusinessMessages", () => {
  it("counts trailing non-customer messages", () => {
    expect(
      countUnansweredBusinessMessages([
        { sender: "customer", content: "a" },
        { sender: "ai", content: "b" },
        { sender: "human", content: "c" },
      ]),
    ).toBe(2);
  });

  it("returns 0 when the customer spoke last", () => {
    expect(
      countUnansweredBusinessMessages([
        { sender: "ai", content: "b" },
        { sender: "customer", content: "c" },
      ]),
    ).toBe(0);
  });
});

describe("followupPolicy: computeNextFollowUpTime", () => {
  it("schedules inside business hours in the given timezone", () => {
    const now = instantFromWallClock({ year: 2026, month: 6, day: 16, hour: 10, minute: 0 }, "UTC");
    const runAt = computeNextFollowUpTime({
      now,
      delayHours: 24,
      timeZone: "UTC",
      businessHours: DEFAULT_BUSINESS_HOURS,
    });
    expect(runAt.getTime()).toBeGreaterThan(now.getTime());
    const wall = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "2-digit", hourCycle: "h23" }).format(runAt);
    const hour = Number(wall);
    expect(hour).toBeGreaterThanOrEqual(DEFAULT_BUSINESS_HOURS.startHour);
    expect(hour).toBeLessThan(DEFAULT_BUSINESS_HOURS.endHour);
  });
});
