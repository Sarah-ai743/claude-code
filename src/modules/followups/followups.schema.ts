import { z } from "zod";
import { SchedulingCompanyContextSchema } from "../organizations/organizations.schema.js";

/** One message in the conversation so far. */
export const ConversationMessageSchema = z.object({
  /** Who wrote it. Only CUSTOMER messages can express an opt-out. */
  sender: z.enum(["CUSTOMER", "BUSINESS"]),
  message: z.string().trim().min(1).max(5000),
  sentAt: z.iso.datetime({ message: "sentAt must be an ISO-8601 timestamp" }),
});

export const LeadStatusSchema = z.enum([
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "QUOTE_SENT",
  "WON",
  "LOST",
]);

export const LeadTemperatureSchema = z.enum(["HOT", "WARM", "COLD"]);

export const SuggestFollowUpRequestSchema = z.object({
  /** Optional: ties the resulting activity entry to a lead when you have one. */
  leadId: z.string().trim().min(1).max(120).optional(),
  messageHistory: z
    .array(ConversationMessageSchema)
    .min(1, "messageHistory needs at least one message")
    .max(50, "messageHistory is limited to the 50 most recent messages"),
  leadStatus: LeadStatusSchema,
  leadTemperature: LeadTemperatureSchema,
  lastContactAt: z.iso.datetime({ message: "lastContactAt must be an ISO-8601 timestamp" }),
  customerName: z.string().trim().min(1).max(120).optional(),
  companyContext: SchedulingCompanyContextSchema,
});

export type SuggestFollowUpRequest = z.infer<typeof SuggestFollowUpRequestSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type LeadStatus = z.infer<typeof LeadStatusSchema>;
export type LeadTemperature = z.infer<typeof LeadTemperatureSchema>;

/** What the endpoint returns. `null` means "not applicable because we are not following up". */
export interface SuggestFollowUpResponse {
  shouldFollowUp: boolean;
  reason: string;
  recommendedFollowUpTime: string | null;
  suggestedMessage: string | null;
  urgency: "HIGH" | "MEDIUM" | "LOW";
}
