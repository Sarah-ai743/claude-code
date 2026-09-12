import { z } from "zod";

/**
 * An approval is *data*, not code: a type plus a payload.
 *
 * When execution is built (Phase 5), the executor will look up a handler by
 * `proposedAction`. Adding a new kind of automation then means adding a handler
 * — it never means touching the approval workflow itself.
 */
export const ProposedActionSchema = z.enum([
  "SEND_EMAIL",
  "SEND_FOLLOW_UP",
  "BOOK_MEETING",
  "UPDATE_CRM",
  "CHANGE_LEAD_STATUS",
]);

export const RiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const ApprovalStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]);

export const CreateApprovalRequestSchema = z.object({
  leadId: z.string().trim().min(1).max(120),
  customerName: z.string().trim().min(1).max(120),
  proposedAction: ProposedActionSchema,
  /** The exact text that would go to the customer, when the action sends something. */
  proposedMessage: z.string().trim().min(1).max(4000).optional(),
  reason: z.string().trim().min(3, "reason must explain why this is being proposed").max(1000),
  /** Optional: derived from the action when the caller does not supply one. */
  riskLevel: RiskLevelSchema.optional(),
  /**
   * Who proposed this. Until authentication lands (Phase 1) this is taken from
   * the request body; after that it must come from the token instead — a
   * client-supplied actor in an audit log can be forged.
   */
  createdBy: z.string().trim().min(1).max(120).default("ai"),
  actorType: z.enum(["USER", "AI", "SYSTEM", "API_KEY"]).default("AI"),
});

export const ListApprovalsQuerySchema = z.object({
  status: ApprovalStatusSchema.optional(),
  riskLevel: RiskLevelSchema.optional(),
  leadId: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  /** The id of the last item from the previous page. */
  cursor: z.string().trim().min(1).max(120).optional(),
});

export const ApproveRequestSchema = z.object({
  decidedBy: z.string().trim().min(1).max(120).default("unknown"),
  /**
   * A human may improve the draft before approving. Both versions are kept:
   * the difference between what the AI wrote and what a person was willing to
   * send is the most useful quality signal this system can collect.
   */
  editedMessage: z.string().trim().min(1).max(4000).optional(),
  note: z.string().trim().min(1).max(1000).optional(),
});

export const RejectRequestSchema = z.object({
  decidedBy: z.string().trim().min(1).max(120).default("unknown"),
  /** Required: a rejection without a reason teaches you nothing. */
  reason: z.string().trim().min(3, "reason must say why this was rejected").max(1000),
});

export const ApprovalIdParamSchema = z.object({
  id: z.string().trim().min(1).max(120),
});

export type CreateApprovalRequest = z.infer<typeof CreateApprovalRequestSchema>;
export type ListApprovalsQuery = z.infer<typeof ListApprovalsQuerySchema>;
export type ApproveRequest = z.infer<typeof ApproveRequestSchema>;
export type RejectRequest = z.infer<typeof RejectRequestSchema>;
export type ProposedAction = z.infer<typeof ProposedActionSchema>;
export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

/** One item in the approval queue. */
export interface ApprovalRecord {
  id: string;
  leadId: string;
  customerName: string;
  proposedAction: ProposedAction;
  proposedMessage: string | null;
  reason: string;
  riskLevel: RiskLevel;
  status: ApprovalStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  /** Set once a human decides. */
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  /** The human's edit, kept alongside the original rather than replacing it. */
  approvedMessage: string | null;
}
