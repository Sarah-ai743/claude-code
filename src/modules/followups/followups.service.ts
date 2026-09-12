import { suggestFollowUpTask } from "../../ai/tasks/suggestFollowUp.task.js";
import { getAIProvider } from "../../ai/providers/index.js";
import { logger } from "../../lib/logger.js";
import { recordActivity } from "../audit/audit.service.js";
import { formatInTimeZone } from "../../lib/businessTime.js";
import { checkFollowUpPolicy, computeFollowUpTime } from "./followups.policy.js";
import type { SuggestFollowUpRequest, SuggestFollowUpResponse } from "./followups.schema.js";

export interface SuggestFollowUpResult {
  suggestion: SuggestFollowUpResponse;
  meta: {
    /** False when policy answered without spending money on a model call. */
    aiCalled: boolean;
    model: string | null;
    promptVersion: string | null;
    latencyMs: number | null;
    policy: {
      blocked: boolean;
      code: string | null;
      earliestAllowedAt: string | null;
      timezone: string;
    };
    /** Nothing is sent anywhere. A human decides. */
    approval: {
      required: true;
      status: "PENDING_HUMAN_APPROVAL";
      note: string;
    };
  };
}

const APPROVAL_NOTE =
  "This is a draft only. Nothing has been sent, scheduled, or queued. " +
  "A human must approve it before it reaches the customer.";

/**
 * Decides whether to follow up, and drafts the message if so.
 *
 * The order below is the whole design:
 *
 *   1. Deterministic policy runs FIRST. If it blocks, we return immediately and
 *      never call the model — which also means a blocked lead costs nothing.
 *   2. Only if policy permits does the model get asked for its judgement.
 *   3. The model may still say no. It can never say yes to something policy
 *      already refused, because in that case it was never consulted.
 *   4. The timestamp is computed by us, in the business's timezone.
 */
export async function suggestFollowUp(
  input: SuggestFollowUpRequest,
  context: { requestId: string; now?: Date },
): Promise<SuggestFollowUpResult> {
  const now = context.now ?? new Date();
  const lastContactAt = new Date(input.lastContactAt);
  const timezone = input.companyContext.timezone;

  const block = checkFollowUpPolicy({
    messages: input.messageHistory,
    leadStatus: input.leadStatus,
    leadTemperature: input.leadTemperature,
    lastContactAt,
    now,
  });

  if (block) {
    logger.info(
      {
        requestId: context.requestId,
        decision: "blocked",
        policyCode: block.code,
        leadStatus: input.leadStatus,
        leadTemperature: input.leadTemperature,
      },
      "followup.suggestion.blocked",
    );

    await recordActivity({
      eventType: "FOLLOWUP_BLOCKED",
      leadId: input.leadId ?? null,
      userId: null,
      actorType: "SYSTEM",
      description: `No follow-up suggested: ${block.reason}`,
      metadata: {
        policyCode: block.code,
        leadStatus: input.leadStatus,
        leadTemperature: input.leadTemperature,
        aiCalled: false,
      },
      requestId: context.requestId,
      subjectType: input.leadId ? "lead" : null,
      subjectId: input.leadId ?? null,
    });

    return {
      suggestion: {
        shouldFollowUp: false,
        reason: block.reason,
        recommendedFollowUpTime: null,
        // Deliberately no draft: a message that must not be sent should not
        // exist in a form somebody could copy and paste.
        suggestedMessage: null,
        urgency: "LOW",
      },
      meta: {
        aiCalled: false,
        model: null,
        promptVersion: null,
        latencyMs: null,
        policy: {
          blocked: true,
          code: block.code,
          earliestAllowedAt: block.earliestAllowedAt?.toISOString() ?? null,
          timezone,
        },
        approval: {
          required: true,
          status: "PENDING_HUMAN_APPROVAL",
          note: APPROVAL_NOTE,
        },
      },
    };
  }

  const hoursSinceLastContact = (now.getTime() - lastContactAt.getTime()) / (60 * 60 * 1000);

  const result = await suggestFollowUpTask(getAIProvider(), {
    conversation: input.messageHistory,
    leadStatus: input.leadStatus,
    leadTemperature: input.leadTemperature,
    hoursSinceLastContact,
    customerName: input.customerName,
    companyContext: {
      businessType: input.companyContext.businessType,
      services: input.companyContext.services,
      language: input.companyContext.language,
      tone: input.companyContext.tone,
      timezone,
    },
  });

  const suggestion = result.suggestion;

  // The model gets a second chance to stop us, never to start us.
  const modelSaysNo = !suggestion.shouldFollowUp || suggestion.customerOptedOut;

  if (modelSaysNo) {
    logger.info(
      {
        requestId: context.requestId,
        decision: "declined_by_model",
        optedOut: suggestion.customerOptedOut,
        model: result.model,
        promptVersion: result.promptVersion,
      },
      "followup.suggestion.declined",
    );

    await recordActivity({
      eventType: "FOLLOWUP_BLOCKED",
      leadId: input.leadId ?? null,
      userId: null,
      actorType: "AI",
      description: suggestion.customerOptedOut
        ? "No follow-up suggested: the AI judged that the customer asked not to be contacted."
        : "No follow-up suggested: the AI judged that a message would not help.",
      metadata: {
        optedOut: suggestion.customerOptedOut,
        model: result.model,
        promptVersion: result.promptVersion,
        aiCalled: true,
      },
      requestId: context.requestId,
      subjectType: input.leadId ? "lead" : null,
      subjectId: input.leadId ?? null,
    });

    return {
      suggestion: {
        shouldFollowUp: false,
        reason: suggestion.customerOptedOut
          ? "The customer asked not to be contacted again, so no follow-up will be suggested."
          : suggestion.reason,
        recommendedFollowUpTime: null,
        suggestedMessage: null,
        urgency: "LOW",
      },
      meta: {
        aiCalled: true,
        model: result.model,
        promptVersion: result.promptVersion,
        latencyMs: result.latencyMs,
        policy: {
          blocked: false,
          code: suggestion.customerOptedOut ? "CUSTOMER_OPTED_OUT" : null,
          earliestAllowedAt: null,
          timezone,
        },
        approval: {
          required: true,
          status: "PENDING_HUMAN_APPROVAL",
          note: APPROVAL_NOTE,
        },
      },
    };
  }

  const followUpAt = computeFollowUpTime({
    now,
    delayHours: suggestion.recommendedDelayHours,
    preferredTimeOfDay: suggestion.preferredTimeOfDay,
    timeZone: timezone,
    businessHours: input.companyContext.businessHours,
  });

  logger.info(
    {
      requestId: context.requestId,
      decision: "follow_up",
      urgency: suggestion.urgency,
      delayHours: suggestion.recommendedDelayHours,
      scheduledFor: followUpAt.toISOString(),
      scheduledForLocal: formatInTimeZone(followUpAt, timezone),
      timezone,
      model: result.model,
      promptVersion: result.promptVersion,
      latencyMs: result.latencyMs,
    },
    "followup.suggestion.completed",
  );

  await recordActivity({
    eventType: "FOLLOWUP_SUGGESTED",
    leadId: input.leadId ?? null,
    userId: null,
    actorType: "AI",
    description:
      `The AI drafted a follow-up (${suggestion.urgency} urgency) for ` +
      `${formatInTimeZone(followUpAt, timezone)} (${timezone}). ` +
      "It needs human approval before it can be sent.",
    metadata: {
      urgency: suggestion.urgency,
      scheduledFor: followUpAt.toISOString(),
      timezone,
      delayHours: suggestion.recommendedDelayHours,
      model: result.model,
      promptVersion: result.promptVersion,
      approvalRequired: true,
    },
    requestId: context.requestId,
    subjectType: input.leadId ? "lead" : null,
    subjectId: input.leadId ?? null,
  });

  return {
    suggestion: {
      shouldFollowUp: true,
      reason: suggestion.reason,
      recommendedFollowUpTime: followUpAt.toISOString(),
      suggestedMessage: suggestion.suggestedMessage,
      urgency: suggestion.urgency,
    },
    meta: {
      aiCalled: true,
      model: result.model,
      promptVersion: result.promptVersion,
      latencyMs: result.latencyMs,
      policy: {
        blocked: false,
        code: null,
        earliestAllowedAt: null,
        timezone,
      },
      approval: {
        required: true,
        status: "PENDING_HUMAN_APPROVAL",
        note: APPROVAL_NOTE,
      },
    },
  };
}
