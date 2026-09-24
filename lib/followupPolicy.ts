/**
 * The rules that are NOT left to the AI.
 *
 * "Do not spam" and "do not contact someone who opted out" are promises to
 * a customer. These are plain deterministic checks that run BEFORE any
 * follow-up is sent, and the AI can never override them — it can only ever
 * cause a follow-up to be skipped (via opt-out detection feeding into
 * `opted_out` on the lead), never force one to happen outside these rules.
 */
import type { LeadStage } from "@/lib/supabase/database.types";
import {
  snapToBusinessHours,
  instantFromWallClock,
  wallClockIn,
  type BusinessHours,
} from "@/lib/businessTime";

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

const DECLINED_PATTERNS: RegExp[] = [
  /\b(?:not|no\s+longer)\s+interested\b/i,
  /\bwe(?:'ve| have)\s+(?:gone|went)\s+with\s+(?:someone|another|somebody)\b/i,
  /\balready\s+(?:booked|hired|found)\s+(?:someone|another|somebody)\b/i,
];

const STAGES_THAT_BLOCK_FOLLOWUP: LeadStage[] = ["won", "lost", "human_review"];

export const MAX_UNANSWERED_MESSAGES = 3;

export type BlockCode =
  | "CUSTOMER_OPTED_OUT"
  | "CUSTOMER_DECLINED"
  | "LEAD_STAGE_BLOCKS_FOLLOWUP"
  | "TOO_SOON"
  | "TOO_MANY_UNANSWERED"
  | "MAX_FOLLOWUPS_REACHED"
  | "OUTSIDE_ALLOWED_HOURS";

export interface PolicyBlock {
  code: BlockCode;
  reason: string;
  earliestAllowedAt?: Date;
}

export interface FollowUpMessage {
  sender: "customer" | "ai" | "human";
  content: string;
}

export function detectOptOut(messages: FollowUpMessage[]): boolean {
  return messages
    .filter((m) => m.sender === "customer")
    .some((m) => OPT_OUT_PATTERNS.some((pattern) => pattern.test(m.content)));
}

export function detectDeclined(messages: FollowUpMessage[]): boolean {
  return messages
    .filter((m) => m.sender === "customer")
    .some((m) => DECLINED_PATTERNS.some((pattern) => pattern.test(m.content)));
}

export function countUnansweredBusinessMessages(messages: FollowUpMessage[]): number {
  let count = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index];
    if (!entry || entry.sender === "customer") break;
    count += 1;
  }
  return count;
}

export interface PolicyInput {
  messages: FollowUpMessage[];
  leadStage: LeadStage;
  optedOut: boolean;
  attemptNumber: number;
  maxFollowups: number;
  lastContactAt: Date;
  now: Date;
  minQuietHours: number;
  allowedStartHour: number;
  allowedEndHour: number;
  timeZone: string;
}

/**
 * Runs every hard rule. Returns the first block found, or null when a
 * follow-up is permitted right now.
 */
export function checkFollowUpPolicy(input: PolicyInput): PolicyBlock | null {
  if (input.optedOut || detectOptOut(input.messages)) {
    return {
      code: "CUSTOMER_OPTED_OUT",
      reason: "The customer opted out of further contact. No follow-up may be sent.",
    };
  }

  if (detectDeclined(input.messages)) {
    return {
      code: "CUSTOMER_DECLINED",
      reason: "The customer indicated they are not interested or chose someone else.",
    };
  }

  if (STAGES_THAT_BLOCK_FOLLOWUP.includes(input.leadStage)) {
    return {
      code: "LEAD_STAGE_BLOCKS_FOLLOWUP",
      reason: `Lead stage '${input.leadStage}' does not allow automated follow-up.`,
    };
  }

  if (input.attemptNumber >= input.maxFollowups) {
    return {
      code: "MAX_FOLLOWUPS_REACHED",
      reason: `Maximum of ${input.maxFollowups} follow-ups already reached for this lead.`,
    };
  }

  const unanswered = countUnansweredBusinessMessages(input.messages);
  if (unanswered >= MAX_UNANSWERED_MESSAGES) {
    return {
      code: "TOO_MANY_UNANSWERED",
      reason: `${unanswered} messages sent with no reply — sending another would be spam.`,
    };
  }

  const hoursSinceContact = (input.now.getTime() - input.lastContactAt.getTime()) / (60 * 60 * 1000);
  if (hoursSinceContact < input.minQuietHours) {
    const earliestAllowedAt = new Date(
      input.lastContactAt.getTime() + input.minQuietHours * 60 * 60 * 1000,
    );
    return {
      code: "TOO_SOON",
      reason: `Only ${Math.floor(hoursSinceContact)}h passed since last contact; minimum quiet period is ${input.minQuietHours}h.`,
      earliestAllowedAt,
    };
  }

  const wall = wallClockIn(input.now, input.timeZone);
  if (wall.hour < input.allowedStartHour || wall.hour >= input.allowedEndHour) {
    return {
      code: "OUTSIDE_ALLOWED_HOURS",
      reason: `Current local time (${wall.hour}:00) is outside the allowed communication hours (${input.allowedStartHour}:00–${input.allowedEndHour}:00).`,
    };
  }

  return null;
}

/** Turns "wait N hours" into a real instant inside the business's allowed hours. */
export function computeNextFollowUpTime(options: {
  now: Date;
  delayHours: number;
  timeZone: string;
  businessHours: BusinessHours;
}): Date {
  const { now, delayHours, timeZone, businessHours } = options;
  const earliest = new Date(now.getTime() + delayHours * 60 * 60 * 1000);
  const wall = wallClockIn(earliest, timeZone);
  const candidate = instantFromWallClock(
    { ...wall, hour: Math.max(wall.hour, businessHours.startHour), minute: 0 },
    timeZone,
  );
  return snapToBusinessHours(
    candidate.getTime() < earliest.getTime() ? earliest : candidate,
    timeZone,
    businessHours,
  );
}
