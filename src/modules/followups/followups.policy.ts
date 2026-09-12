/**
 * The rules that are NOT left to the AI.
 *
 * "Do not spam" and "do not contact someone who asked you to stop" are promises
 * to a customer. A model's judgement is good, but it is a judgement — it can be
 * argued out of a rule by a cleverly worded message, and it varies run to run.
 * So these checks are plain deterministic code that runs BEFORE the model is
 * called, and the model can never overturn them.
 *
 * The invariant, enforced in the service and covered by tests:
 *   the AI can only ever turn a follow-up OFF, never on.
 */
import type {
  ConversationMessage,
  LeadStatus,
  LeadTemperature,
} from "./followups.schema.js";
import {
  snapToBusinessHours,
  instantFromWallClock,
  wallClockIn,
  type BusinessHours,
} from "../../lib/businessTime.js";

/** Explicit "stop contacting me". Checked against customer messages only. */
const OPT_OUT_PATTERNS: RegExp[] = [
  /\bunsubscribe\b/i,
  /\bopt(?:ing)?[\s-]?out\b/i,
  /\b(?:stop|quit|cease)\s+(?:contacting|emailing|messaging|calling|texting)\b/i,
  /\b(?:do\s*n['o]?t|don't|please\s+do\s+not)\s+(?:contact|email|message|call|text)\b/i,
  /\b(?:remove|take)\s+me\s+(?:from|off)\b/i,
  /\bleave\s+me\s+alone\b/i,
  /\bno\s+further\s+(?:contact|communication)\b/i,
  /\bstop\s+sending\b/i,
];

/** Softer, but still a no: the customer has declined. */
const DECLINED_PATTERNS: RegExp[] = [
  /\b(?:not|no\s+longer)\s+interested\b/i,
  /\bwe(?:'ve| have)\s+(?:gone|went)\s+with\s+(?:someone|another|somebody)\b/i,
  /\balready\s+(?:booked|hired|found)\s+(?:someone|another|somebody)\b/i,
];

/** Minimum quiet period since the last contact, by how warm the lead is. */
const MIN_HOURS_BETWEEN_CONTACT: Record<LeadTemperature, number> = {
  HOT: 24,
  WARM: 72,
  COLD: 168,
};

/** Stop after this many of our messages with no reply from the customer. */
export const MAX_UNANSWERED_MESSAGES = 3;

export type BlockCode =
  | "CUSTOMER_OPTED_OUT"
  | "CUSTOMER_DECLINED"
  | "LEAD_CLOSED_WON"
  | "LEAD_CLOSED_LOST"
  | "TOO_SOON"
  | "TOO_MANY_UNANSWERED";

export interface PolicyBlock {
  code: BlockCode;
  reason: string;
  /** When a follow-up would next be acceptable, if ever. */
  earliestAllowedAt?: Date;
}

export function detectOptOut(messages: ConversationMessage[]): boolean {
  return messages
    .filter((entry) => entry.sender === "CUSTOMER")
    .some((entry) => OPT_OUT_PATTERNS.some((pattern) => pattern.test(entry.message)));
}

export function detectDeclined(messages: ConversationMessage[]): boolean {
  return messages
    .filter((entry) => entry.sender === "CUSTOMER")
    .some((entry) => DECLINED_PATTERNS.some((pattern) => pattern.test(entry.message)));
}

/** How many messages we have sent since the customer last said anything. */
export function countUnansweredBusinessMessages(messages: ConversationMessage[]): number {
  let count = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index];
    if (!entry || entry.sender === "CUSTOMER") break;
    count += 1;
  }
  return count;
}

export function minimumQuietHours(temperature: LeadTemperature): number {
  return MIN_HOURS_BETWEEN_CONTACT[temperature];
}

export interface PolicyInput {
  messages: ConversationMessage[];
  leadStatus: LeadStatus;
  leadTemperature: LeadTemperature;
  lastContactAt: Date;
  now: Date;
}

/**
 * Runs every hard rule. Returns the first block found, or null when a follow-up
 * is permitted. Order matters: a customer who opted out is reported as such
 * even if another rule would also have stopped us.
 */
export function checkFollowUpPolicy(input: PolicyInput): PolicyBlock | null {
  if (detectOptOut(input.messages)) {
    return {
      code: "CUSTOMER_OPTED_OUT",
      reason:
        "The customer explicitly asked not to be contacted again. No follow-up may be sent.",
    };
  }

  if (detectDeclined(input.messages)) {
    return {
      code: "CUSTOMER_DECLINED",
      reason:
        "The customer said they are not interested or have chosen someone else. Do not chase them.",
    };
  }

  if (input.leadStatus === "LOST") {
    return {
      code: "LEAD_CLOSED_LOST",
      reason: "This lead is marked as lost, so there is nothing to follow up on.",
    };
  }

  if (input.leadStatus === "WON") {
    return {
      code: "LEAD_CLOSED_WON",
      reason: "This lead is already won — a sales follow-up is not appropriate.",
    };
  }

  const unanswered = countUnansweredBusinessMessages(input.messages);
  if (unanswered >= MAX_UNANSWERED_MESSAGES) {
    return {
      code: "TOO_MANY_UNANSWERED",
      reason:
        `We have sent ${unanswered} messages without a reply. ` +
        "Sending another would be spam; wait for the customer to come back.",
    };
  }

  const quietHours = minimumQuietHours(input.leadTemperature);
  const hoursSinceContact =
    (input.now.getTime() - input.lastContactAt.getTime()) / (60 * 60 * 1000);

  if (hoursSinceContact < quietHours) {
    const earliestAllowedAt = new Date(
      input.lastContactAt.getTime() + quietHours * 60 * 60 * 1000,
    );
    return {
      code: "TOO_SOON",
      reason:
        `Only ${Math.floor(hoursSinceContact)} hours have passed since the last contact. ` +
        `A ${input.leadTemperature.toLowerCase()} lead should be given at least ${quietHours} hours of quiet.`,
      earliestAllowedAt,
    };
  }

  return null;
}

export type TimeOfDay = "MORNING" | "MIDDAY" | "AFTERNOON";

/**
 * Turns the model's "wait roughly this long" into a real instant that falls
 * inside the business's working hours, in the business's own timezone.
 */
export function computeFollowUpTime(options: {
  now: Date;
  delayHours: number;
  preferredTimeOfDay: TimeOfDay;
  timeZone: string;
  businessHours: BusinessHours;
}): Date {
  const { now, delayHours, preferredTimeOfDay, timeZone, businessHours } = options;

  const earliest = new Date(now.getTime() + delayHours * 60 * 60 * 1000);

  const preferredHour = {
    MORNING: businessHours.startHour,
    MIDDAY: 12,
    AFTERNOON: 15,
  }[preferredTimeOfDay];

  // Keep the preference inside opening hours; a "midday" slot is useless to a
  // business that closes at 11.
  const targetHour = Math.min(
    Math.max(preferredHour, businessHours.startHour),
    businessHours.endHour - 1,
  );

  const wall = wallClockIn(earliest, timeZone);
  let candidate = instantFromWallClock({ ...wall, hour: targetHour, minute: 0 }, timeZone);

  // Never schedule earlier than the requested delay allows.
  if (candidate.getTime() < earliest.getTime()) {
    const nextDay = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + 1));
    candidate = instantFromWallClock(
      {
        year: nextDay.getUTCFullYear(),
        month: nextDay.getUTCMonth() + 1,
        day: nextDay.getUTCDate(),
        hour: targetHour,
        minute: 0,
      },
      timeZone,
    );
  }

  return snapToBusinessHours(candidate, timeZone, businessHours);
}
