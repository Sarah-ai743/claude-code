import { newId } from "../../lib/ids.js";
import { logger } from "../../lib/logger.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { recordActivity, getTrail } from "../audit/audit.service.js";
import type { ActivityEntry } from "../audit/audit.types.js";
import { approvalRepository, type ApprovalPage } from "./approvals.repository.js";
import { deriveRiskLevel } from "./approvals.risk.js";
import type {
  ApprovalRecord,
  ApproveRequest,
  CreateApprovalRequest,
  ListApprovalsQuery,
  RejectRequest,
} from "./approvals.schema.js";

export const APPROVAL_SUBJECT = "approval";

/** Nothing runs after approval yet — this is the honest description of that. */
export const EXECUTION_STATUS = {
  status: "NOT_IMPLEMENTED" as const,
  note:
    "Approving records the decision only. No email, task, or CRM update is " +
    "executed — action handlers arrive in a later phase.",
};

export interface ApprovalWithTrail extends ApprovalRecord {
  history: ActivityEntry[];
}

interface ActorContext {
  requestId: string;
}

export async function createApproval(
  input: CreateApprovalRequest,
  context: ActorContext,
): Promise<ApprovalRecord> {
  const now = new Date().toISOString();

  const record: ApprovalRecord = {
    id: newId("apr"),
    leadId: input.leadId,
    customerName: input.customerName,
    proposedAction: input.proposedAction,
    proposedMessage: input.proposedMessage ?? null,
    reason: input.reason,
    riskLevel: input.riskLevel ?? deriveRiskLevel(input.proposedAction),
    status: "PENDING",
    createdAt: now,
    createdBy: input.createdBy,
    updatedAt: now,
    decidedAt: null,
    decidedBy: null,
    decisionNote: null,
    approvedMessage: null,
  };

  await approvalRepository.create(record);

  await recordActivity({
    eventType: "APPROVAL_REQUESTED",
    leadId: record.leadId,
    // A person only when a person proposed it; null when the AI did.
    userId: input.actorType === "USER" ? input.createdBy : null,
    actorType: input.actorType,
    description:
      `${input.actorType === "USER" ? input.createdBy : "The AI"} proposed ` +
      `${record.proposedAction} for ${record.customerName} (${record.riskLevel} risk).`,
    metadata: {
      proposedAction: record.proposedAction,
      riskLevel: record.riskLevel,
      approvalId: record.id,
    },
    requestId: context.requestId,
    subjectType: APPROVAL_SUBJECT,
    subjectId: record.id,
  });

  logger.info(
    {
      requestId: context.requestId,
      approvalId: record.id,
      leadId: record.leadId,
      proposedAction: record.proposedAction,
      riskLevel: record.riskLevel,
    },
    "approval.created",
  );

  return record;
}

export async function listApprovals(query: ListApprovalsQuery): Promise<ApprovalPage> {
  return approvalRepository.list(query);
}

export async function approve(
  id: string,
  input: ApproveRequest,
  context: ActorContext,
): Promise<{ approval: ApprovalWithTrail; execution: typeof EXECUTION_STATUS }> {
  const record = await requirePending(id);
  const now = new Date().toISOString();

  const decided: ApprovalRecord = {
    ...record,
    status: "APPROVED",
    decidedAt: now,
    decidedBy: input.decidedBy,
    decisionNote: input.note ?? null,
    // The original proposedMessage is never overwritten.
    approvedMessage: input.editedMessage ?? record.proposedMessage,
    updatedAt: now,
  };

  await approvalRepository.save(decided);

  const wasEdited =
    input.editedMessage !== undefined && input.editedMessage !== record.proposedMessage;

  await recordActivity({
    eventType: "APPROVAL_APPROVED",
    leadId: decided.leadId,
    userId: input.decidedBy,
    actorType: "USER",
    description:
      `${input.decidedBy} approved ${decided.proposedAction} for ${decided.customerName}` +
      `${wasEdited ? ", after editing the message" : ""}. Nothing was executed.`,
    metadata: {
      proposedAction: decided.proposedAction,
      riskLevel: decided.riskLevel,
      messageEdited: wasEdited,
      note: decided.decisionNote,
      executed: false,
      approvalId: decided.id,
    },
    requestId: context.requestId,
    subjectType: APPROVAL_SUBJECT,
    subjectId: decided.id,
  });

  logger.info(
    {
      requestId: context.requestId,
      approvalId: decided.id,
      decidedBy: decided.decidedBy,
      riskLevel: decided.riskLevel,
      messageEdited: wasEdited,
    },
    "approval.approved",
  );

  return {
    approval: { ...decided, history: await getTrail(APPROVAL_SUBJECT, decided.id) },
    execution: EXECUTION_STATUS,
  };
}

export async function reject(
  id: string,
  input: RejectRequest,
  context: ActorContext,
): Promise<ApprovalWithTrail> {
  const record = await requirePending(id);
  const now = new Date().toISOString();

  const decided: ApprovalRecord = {
    ...record,
    status: "REJECTED",
    decidedAt: now,
    decidedBy: input.decidedBy,
    decisionNote: input.reason,
    approvedMessage: null,
    updatedAt: now,
  };

  await approvalRepository.save(decided);

  await recordActivity({
    eventType: "APPROVAL_REJECTED",
    leadId: decided.leadId,
    userId: input.decidedBy,
    actorType: "USER",
    description: `${input.decidedBy} rejected ${decided.proposedAction} for ${decided.customerName}.`,
    metadata: {
      proposedAction: decided.proposedAction,
      riskLevel: decided.riskLevel,
      reason: input.reason,
      approvalId: decided.id,
    },
    requestId: context.requestId,
    subjectType: APPROVAL_SUBJECT,
    subjectId: decided.id,
  });

  logger.info(
    {
      requestId: context.requestId,
      approvalId: decided.id,
      decidedBy: decided.decidedBy,
      riskLevel: decided.riskLevel,
    },
    "approval.rejected",
  );

  return { ...decided, history: await getTrail(APPROVAL_SUBJECT, decided.id) };
}

/**
 * The state machine, in one place: PENDING → APPROVED or REJECTED, once.
 *
 * A decision is final. Re-approving something already approved would produce a
 * second audit entry for an action that only happened once, and once execution
 * exists it would be a double send.
 */
async function requirePending(id: string): Promise<ApprovalRecord> {
  const record = await approvalRepository.findById(id);

  if (!record) {
    throw new NotFoundError(`No approval exists with id ${id}`);
  }

  if (record.status !== "PENDING") {
    throw new ConflictError(
      `This approval was already ${record.status.toLowerCase()} and cannot be decided again.`,
      [{ status: record.status, decidedAt: record.decidedAt, decidedBy: record.decidedBy }],
    );
  }

  return record;
}
