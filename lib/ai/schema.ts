import { z } from "zod";

/**
 * The exact structured-output contract Claude must return for every lead
 * analysis. This is the single source of truth for what "qualifying a
 * lead" means in this product — every field here is required by the
 * product spec.
 *
 * Note on `intent` vs `urgency`: the field named `intent` is a short
 * free-text description of what the customer wants (e.g. "book a deep
 * clean", "get a quote for rewiring"); `urgency` is the low/medium/high
 * scale for how quickly this needs a reply. Both are asked for
 * separately so a low-urgency enquiry can still carry a clear intent.
 */
export const LeadAnalysisSchema = z.object({
  language: z
    .string()
    .min(2)
    .max(32)
    .describe("BCP-47 / ISO 639-1 language code of the customer's message, e.g. 'en', 'es', 'ar'"),
  intent: z
    .string()
    .min(1)
    .max(300)
    .describe("Short free-text description of what the customer wants"),
  requested_service: z
    .string()
    .max(200)
    .nullable()
    .describe("The specific service requested, if it matches one the business offers; null if unclear or unmatched"),
  urgency: z.enum(["low", "medium", "high"]),
  qualification_status: z.enum([
    "new",
    "needs_information",
    "qualified",
    "quote_requested",
    "booking_ready",
    "human_required",
  ]),
  missing_information: z
    .array(z.string().min(1).max(200))
    .max(20)
    .describe("Qualification questions or details still needed from the customer"),
  sentiment: z.enum(["positive", "neutral", "negative", "frustrated"]),
  recommended_action: z.enum([
    "reply",
    "ask_question",
    "send_booking_link",
    "request_quote_review",
    "human_handoff",
    "no_action",
  ]),
  reply: z
    .string()
    .min(1)
    .max(4000)
    .describe("Draft reply to the customer, written in the customer's detected language"),
  human_review_required: z.boolean(),
  human_review_reason: z
    .string()
    .max(500)
    .nullable()
    .describe("Why a human must review this, or null when not required"),
});

export type LeadAnalysis = z.infer<typeof LeadAnalysisSchema>;

/** Business-rule cross-checks the schema alone can't express. */
export function crossValidate(analysis: LeadAnalysis): string[] {
  const problems: string[] = [];

  if (analysis.human_review_required && !analysis.human_review_reason) {
    problems.push("human_review_required is true but human_review_reason is empty");
  }
  if (analysis.recommended_action === "human_handoff" && !analysis.human_review_required) {
    problems.push("recommended_action is human_handoff but human_review_required is false");
  }
  if (analysis.qualification_status === "human_required" && !analysis.human_review_required) {
    problems.push("qualification_status is human_required but human_review_required is false");
  }

  return problems;
}
