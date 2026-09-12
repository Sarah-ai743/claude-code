import { newId } from "../../lib/ids.js";
import { logger } from "../../lib/logger.js";
import { emailDefaults } from "../../config/env.js";
import { recordActivity } from "../audit/audit.service.js";
import { createApproval } from "../approvals/approvals.service.js";
import * as leadsService from "../leads/leads.service.js";
import { leadRepository, normalizeEmail, type LeadRecord } from "../leads/leads.repository.js";
import { processedEmailRepository } from "./emails.repository.js";
import type { InboundEmail, IngestOutcome } from "./emails.schema.js";

const MESSAGE_PREVIEW_LENGTH = 500;

export interface IngestResult {
  outcome: IngestOutcome;
  leadId: string | null;
  leadCreated: boolean;
  approvalId: string | null;
  analysis: {
    temperature: string;
    intent: string;
    urgency: string;
    mainNeed: string;
    recommendedAction: string;
    suggestedReply: string;
    confidence: number;
  } | null;
}

/**
 * Turns one incoming email into a lead, an analysis, an activity trail and —
 * when required — an approval request.
 *
 * Nothing is ever sent to the customer. There is no outbound email in this
 * system at all, by design: the end of this pipeline is a draft waiting for a
 * human, never a message leaving the building.
 */
export async function ingestEmail(
  email: InboundEmail,
  context: { requestId: string },
): Promise<IngestResult> {
  const senderEmail = normalizeEmail(email.from.email);

  // 1. Duplicate guard, FIRST and atomically.
  //
  // Providers retry. Claiming the id before any work means a retry arriving
  // while the first attempt is still running cannot also create a lead.
  const claimed = await processedEmailRepository.claim(email.messageId);

  if (!claimed) {
    await recordActivity({
      eventType: "EMAIL_DUPLICATE_IGNORED",
      leadId: null,
      userId: null,
      actorType: "SYSTEM",
      description: "An email that had already been processed arrived again and was ignored.",
      metadata: { messageId: email.messageId },
      requestId: context.requestId,
      subjectType: null,
      subjectId: null,
    });

    logger.info(
      { requestId: context.requestId, messageId: email.messageId },
      "email.duplicate_ignored",
    );

    return { outcome: "DUPLICATE_IGNORED", leadId: null, leadCreated: false, approvalId: null, analysis: null };
  }

  // 2. Match an existing lead by address, or create one.
  //
  // The lead is resolved BEFORE the arrival is recorded, so that the
  // EMAIL_RECEIVED entry can carry the leadId. Without it that entry would be
  // missing from a lead's own activity feed — which is the view a person
  // actually looks at when asking "what happened with this customer?"
  const existing = await leadRepository.findByEmail(senderEmail);
  const now = new Date().toISOString();
  const preview = email.textBody.slice(0, MESSAGE_PREVIEW_LENGTH);

  let lead: LeadRecord;
  const leadCreated = existing === null;

  if (existing) {
    lead = await leadRepository.save({
      ...existing,
      // A name we did not have before is worth keeping; one we had is not overwritten.
      name: existing.name ?? email.from.name ?? null,
      lastSubject: email.subject || existing.lastSubject,
      lastMessagePreview: preview,
      messageCount: existing.messageCount + 1,
      lastContactAt: email.receivedAt,
      updatedAt: now,
    });

    await recordActivity({
      eventType: "EMAIL_LINKED_TO_LEAD",
      leadId: lead.id,
      userId: null,
      actorType: "SYSTEM",
      description: `A further email from ${senderEmail} was linked to an existing lead.`,
      metadata: { messageId: email.messageId, messageCount: lead.messageCount },
      requestId: context.requestId,
      subjectType: "lead",
      subjectId: lead.id,
    });
  } else {
    lead = await leadRepository.create({
      id: newId("lead"),
      email: senderEmail,
      name: email.from.name ?? null,
      source: "EMAIL",
      status: "NEW",
      temperature: null,
      intent: null,
      urgency: null,
      mainNeed: null,
      recommendedAction: null,
      suggestedReply: null,
      confidence: null,
      lastSubject: email.subject || null,
      lastMessagePreview: preview,
      messageCount: 1,
      createdAt: now,
      updatedAt: now,
      lastContactAt: email.receivedAt,
    });

    await recordActivity({
      eventType: "LEAD_CREATED_FROM_EMAIL",
      leadId: lead.id,
      userId: null,
      actorType: "SYSTEM",
      description: `A new lead was created from an email from ${senderEmail}.`,
      metadata: { messageId: email.messageId, source: "EMAIL" },
      requestId: context.requestId,
      subjectType: "lead",
      subjectId: lead.id,
    });
  }

  // 3. Record the arrival, now that it can be tied to a lead.
  //
  // Note what the metadata does NOT contain: the body, the subject, or any
  // attachment content. This log is permanent, and a customer's words do not
  // belong in a permanent store. Counts and sizes are enough to audit with.
  await recordActivity({
    eventType: "EMAIL_RECEIVED",
    leadId: lead.id,
    userId: null,
    actorType: "SYSTEM",
    description: `An email arrived from ${senderEmail}.`,
    metadata: {
      messageId: email.messageId,
      to: email.to,
      attachmentCount: email.attachments.length,
      bodyLength: email.textBody.length,
      hasHtmlBody: Boolean(email.htmlBody),
    },
    requestId: context.requestId,
    subjectType: "lead",
    subjectId: lead.id,
  });

  // 4. Analyze, through the existing analysis logic — same prompts, same
  //    schema, same anti-invention guardrails as the manual endpoint.
  let analysis;
  try {
    const result = await leadsService.analyzeLead(
      {
        leadId: lead.id,
        // The subject carries real intent ("Quote for Friday?"), so it is part
        // of what gets analyzed rather than thrown away.
        message: email.subject ? `Subject: ${email.subject}\n\n${email.textBody}` : email.textBody,
        customerName: lead.name ?? undefined,
        companyContext: {
          businessType: emailDefaults.businessType,
          services: emailDefaults.services,
          language: emailDefaults.language,
        },
      },
      { requestId: context.requestId },
    );
    analysis = result.analysis;
  } catch (error) {
    // The email is NOT lost: the lead exists, the arrival is logged, and this
    // failure is visible in the activity feed. What is missing is the analysis.
    //
    // The message id stays claimed, so a provider retry will not create a
    // second lead — which also means this analysis is not retried automatically.
    // Re-analysis belongs to the job queue that arrives with the database.
    await recordActivity({
      eventType: "LEAD_ANALYSIS_FAILED",
      leadId: lead.id,
      userId: null,
      actorType: "SYSTEM",
      description: "The email became a lead, but the AI analysis failed. No reply was drafted.",
      metadata: {
        messageId: email.messageId,
        // The error TYPE, never the raw error: upstream messages can quote the
        // request, and that could include the customer's words or a credential.
        errorName: error instanceof Error ? error.name : "UnknownError",
      },
      requestId: context.requestId,
      subjectType: "lead",
      subjectId: lead.id,
    });

    logger.error(
      { requestId: context.requestId, leadId: lead.id, err: error },
      "email.analysis_failed",
    );

    return {
      outcome: "RECEIVED_ANALYSIS_FAILED",
      leadId: lead.id,
      leadCreated,
      approvalId: null,
      analysis: null,
    };
  }

  // 5. Store the analysis on the lead.
  lead = await leadRepository.save({
    ...lead,
    temperature: analysis.temperature,
    intent: analysis.intent,
    urgency: analysis.urgency,
    mainNeed: analysis.mainNeed,
    recommendedAction: analysis.recommendedAction,
    suggestedReply: analysis.suggestedReply,
    confidence: analysis.confidence,
    updatedAt: new Date().toISOString(),
  });

  await recordActivity({
    eventType: "REPLY_GENERATED",
    leadId: lead.id,
    userId: null,
    actorType: "AI",
    description: "A reply was drafted for this email. It has not been sent.",
    metadata: {
      messageId: email.messageId,
      temperature: analysis.temperature,
      urgency: analysis.urgency,
      sent: false,
    },
    requestId: context.requestId,
    subjectType: "lead",
    subjectId: lead.id,
  });

  // 6. Hand the draft to a human.
  let approvalId: string | null = null;

  if (emailDefaults.approvalRequired) {
    const approval = await createApproval(
      {
        leadId: lead.id,
        customerName: lead.name ?? senderEmail,
        proposedAction: "SEND_EMAIL",
        proposedMessage: analysis.suggestedReply,
        reason: `Reply to an inbound email. ${analysis.recommendedAction}`,
        createdBy: "ai",
        actorType: "AI",
      },
      { requestId: context.requestId },
    );
    approvalId = approval.id;
  }

  logger.info(
    {
      requestId: context.requestId,
      leadId: lead.id,
      leadCreated,
      temperature: analysis.temperature,
      urgency: analysis.urgency,
      approvalId,
      messageLength: email.textBody.length,
    },
    "email.ingested",
  );

  return {
    outcome: "PROCESSED",
    leadId: lead.id,
    leadCreated,
    approvalId,
    analysis: {
      temperature: analysis.temperature,
      intent: analysis.intent,
      urgency: analysis.urgency,
      mainNeed: analysis.mainNeed,
      recommendedAction: analysis.recommendedAction,
      suggestedReply: analysis.suggestedReply,
      confidence: analysis.confidence,
    },
  };
}
