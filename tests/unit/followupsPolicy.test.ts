import { describe, expect, it } from "vitest";
import {
  checkFollowUpPolicy,
  computeFollowUpTime,
  countUnansweredBusinessMessages,
  detectOptOut,
  detectDeclined,
  MAX_UNANSWERED_MESSAGES,
} from "../../src/modules/followups/followups.policy.js";
import { DEFAULT_BUSINESS_HOURS } from "../../src/lib/businessTime.js";
import type { ConversationMessage } from "../../src/modules/followups/followups.schema.js";

const customer = (message: string, sentAt = "2026-01-01T10:00:00.000Z"): ConversationMessage => ({
  sender: "CUSTOMER",
  message,
  sentAt,
});

const business = (message: string, sentAt = "2026-01-01T11:00:00.000Z"): ConversationMessage => ({
  sender: "BUSINESS",
  message,
  sentAt,
});

const NOW = new Date("2026-01-12T09:00:00.000Z"); // a Monday

describe("detectOptOut", () => {
  it.each([
    "Please stop contacting me.",
    "STOP EMAILING ME",
    "Do not contact me again",
    "don't call me please",
    "Please remove me from your list",
    "unsubscribe",
    "I want to opt out",
    "Just leave me alone",
    "No further contact please",
  ])("recognises %j", (message) => {
    expect(detectOptOut([customer(message)])).toBe(true);
  });

  it("ignores ordinary messages", () => {
    expect(detectOptOut([customer("Can you call me tomorrow about the quote?")])).toBe(false);
  });

  it("only looks at what the CUSTOMER wrote", () => {
    // Our own footer must never opt the customer out.
    expect(detectOptOut([business("Reply STOP to unsubscribe from updates.")])).toBe(false);
  });
});

describe("detectDeclined", () => {
  it("recognises a customer who has chosen someone else", () => {
    expect(detectDeclined([customer("Thanks, but we've gone with another company.")])).toBe(true);
    expect(detectDeclined([customer("Not interested, thanks")])).toBe(true);
  });

  it("does not fire on a normal reply", () => {
    expect(detectDeclined([customer("Interested — what's the next step?")])).toBe(false);
  });
});

describe("countUnansweredBusinessMessages", () => {
  it("counts only the trailing run since the customer last spoke", () => {
    const history = [
      customer("Hi, can you clean my flat?"),
      business("Sure — what size is it?"),
      customer("Three bedrooms"),
      business("Thanks, sending a quote"),
      business("Just checking you got that"),
    ];
    expect(countUnansweredBusinessMessages(history)).toBe(2);
  });

  it("is zero when the customer spoke last", () => {
    expect(countUnansweredBusinessMessages([business("Hello?"), customer("Sorry, busy week")])).toBe(0);
  });
});

describe("checkFollowUpPolicy", () => {
  const base = {
    leadStatus: "CONTACTED" as const,
    leadTemperature: "WARM" as const,
    lastContactAt: new Date("2026-01-01T09:00:00.000Z"), // 11 days before NOW
    now: NOW,
  };

  it("permits a follow-up when every rule is satisfied", () => {
    expect(
      checkFollowUpPolicy({ ...base, messages: [customer("Sounds good, send it over")] }),
    ).toBeNull();
  });

  it("blocks an opt-out before anything else", () => {
    const block = checkFollowUpPolicy({
      ...base,
      messages: [customer("Please stop contacting me")],
    });
    expect(block?.code).toBe("CUSTOMER_OPTED_OUT");
  });

  it("blocks a customer who declined", () => {
    const block = checkFollowUpPolicy({
      ...base,
      messages: [customer("We're not interested, thanks")],
    });
    expect(block?.code).toBe("CUSTOMER_DECLINED");
  });

  it("blocks a lost lead", () => {
    const block = checkFollowUpPolicy({
      ...base,
      leadStatus: "LOST",
      messages: [customer("ok")],
    });
    expect(block?.code).toBe("LEAD_CLOSED_LOST");
  });

  it("blocks a won lead", () => {
    const block = checkFollowUpPolicy({
      ...base,
      leadStatus: "WON",
      messages: [customer("ok")],
    });
    expect(block?.code).toBe("LEAD_CLOSED_WON");
  });

  it(`blocks after ${MAX_UNANSWERED_MESSAGES} unanswered messages`, () => {
    const block = checkFollowUpPolicy({
      ...base,
      messages: [
        customer("Hi"),
        business("Hello — here is our quote"),
        business("Just checking in"),
        business("Following up again"),
      ],
    });
    expect(block?.code).toBe("TOO_MANY_UNANSWERED");
  });

  it("allows one message below the unanswered limit", () => {
    expect(
      checkFollowUpPolicy({
        ...base,
        messages: [customer("Hi"), business("Here is our quote"), business("Checking in")],
      }),
    ).toBeNull();
  });

  describe("quiet period by temperature", () => {
    const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000);

    it("blocks a hot lead contacted 3 hours ago", () => {
      const block = checkFollowUpPolicy({
        ...base,
        leadTemperature: "HOT",
        lastContactAt: hoursAgo(3),
        messages: [customer("Hi")],
      });
      expect(block?.code).toBe("TOO_SOON");
      expect(block?.earliestAllowedAt?.toISOString()).toBe(
        new Date(hoursAgo(3).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      );
    });

    it("allows a hot lead contacted 30 hours ago", () => {
      expect(
        checkFollowUpPolicy({
          ...base,
          leadTemperature: "HOT",
          lastContactAt: hoursAgo(30),
          messages: [customer("Hi")],
        }),
      ).toBeNull();
    });

    it("holds a cold lead to a full week", () => {
      const block = checkFollowUpPolicy({
        ...base,
        leadTemperature: "COLD",
        lastContactAt: hoursAgo(100),
        messages: [customer("Hi")],
      });
      expect(block?.code).toBe("TOO_SOON");
    });

    it("allows a warm lead after three days", () => {
      expect(
        checkFollowUpPolicy({
          ...base,
          leadTemperature: "WARM",
          lastContactAt: hoursAgo(80),
          messages: [customer("Hi")],
        }),
      ).toBeNull();
    });
  });
});

describe("computeFollowUpTime", () => {
  const BERLIN = "Europe/Berlin";

  it("never schedules before the requested delay has passed", () => {
    const now = new Date("2026-01-05T08:00:00.000Z"); // Monday 09:00 Berlin
    const when = computeFollowUpTime({
      now,
      delayHours: 48,
      preferredTimeOfDay: "MORNING",
      timeZone: BERLIN,
      businessHours: DEFAULT_BUSINESS_HOURS,
    });
    expect(when.getTime()).toBeGreaterThanOrEqual(now.getTime() + 48 * 60 * 60 * 1000);
    expect(when.toISOString()).toBe("2026-01-07T08:00:00.000Z"); // Wednesday 09:00
  });

  it("lands inside working hours even when the delay points at the middle of the night", () => {
    const now = new Date("2026-01-05T20:00:00.000Z"); // Monday 21:00 Berlin
    const when = computeFollowUpTime({
      now,
      delayHours: 6, // would be 03:00 Berlin
      preferredTimeOfDay: "MORNING",
      timeZone: BERLIN,
      businessHours: DEFAULT_BUSINESS_HOURS,
    });
    expect(when.toISOString()).toBe("2026-01-06T08:00:00.000Z"); // Tuesday 09:00
  });

  it("honours an afternoon preference", () => {
    const now = new Date("2026-01-05T08:00:00.000Z");
    const when = computeFollowUpTime({
      now,
      delayHours: 24,
      preferredTimeOfDay: "AFTERNOON",
      timeZone: BERLIN,
      businessHours: DEFAULT_BUSINESS_HOURS,
    });
    expect(when.toISOString()).toBe("2026-01-06T14:00:00.000Z"); // Tuesday 15:00 Berlin
  });

  it("skips the weekend", () => {
    const now = new Date("2026-01-09T08:00:00.000Z"); // Friday 09:00 Berlin
    const when = computeFollowUpTime({
      now,
      delayHours: 48, // Sunday
      preferredTimeOfDay: "MORNING",
      timeZone: BERLIN,
      businessHours: DEFAULT_BUSINESS_HOURS,
    });
    expect(when.toISOString()).toBe("2026-01-12T08:00:00.000Z"); // Monday 09:00
  });

  it("clamps a midday preference into short opening hours", () => {
    const now = new Date("2026-01-05T06:00:00.000Z");
    const when = computeFollowUpTime({
      now,
      delayHours: 24,
      preferredTimeOfDay: "MIDDAY",
      timeZone: BERLIN,
      businessHours: { startHour: 8, endHour: 11, workingDays: [1, 2, 3, 4, 5] },
    });
    // 12:00 is past closing, so it clamps to the last working hour, 10:00 Berlin.
    expect(when.toISOString()).toBe("2026-01-06T09:00:00.000Z");
  });
});
