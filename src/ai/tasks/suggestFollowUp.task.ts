import { z } from "zod";
import type { AIProvider } from "../types.js";
import {
  SUGGEST_FOLLOWUP_PROMPT_VERSION,
  buildSystemPrompt,
  buildUserPrompt,
  type SuggestFollowUpPromptInput,
} from "../prompts/suggestFollowUp.prompt.js";

/**
 * What the model is allowed to return.
 *
 * Note what is NOT here: a calendar date. The model returns a delay in hours
 * and a rough time of day; the application turns that into a real instant in
 * the business's timezone. Models are unreliable at date arithmetic, and this
 * removes the opportunity to get it wrong.
 */
export const FollowUpSuggestionSchema = z.object({
  shouldFollowUp: z
    .boolean()
    .describe("Whether a follow-up message is warranted at all"),
  customerOptedOut: z
    .boolean()
    .describe("True if the customer asked, in any wording, not to be contacted again"),
  reason: z
    .string()
    .min(1)
    .max(600)
    .describe("Why this decision was reached, grounded in the conversation"),
  recommendedDelayHours: z
    .number()
    .int()
    .min(1)
    .max(720)
    .describe("How many hours to wait from now before following up"),
  preferredTimeOfDay: z
    .enum(["MORNING", "MIDDAY", "AFTERNOON"])
    .describe("Rough time of day that suits this follow-up"),
  suggestedMessage: z
    .string()
    .min(1)
    .max(2000)
    .describe("Draft follow-up message for a human to review and send"),
  urgency: z
    .enum(["HIGH", "MEDIUM", "LOW"])
    .describe("How much this follow-up matters relative to other work"),
});

export type FollowUpSuggestion = z.infer<typeof FollowUpSuggestionSchema>;

export interface SuggestFollowUpTaskResult {
  suggestion: FollowUpSuggestion;
  model: string;
  promptVersion: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number };
}

export async function suggestFollowUpTask(
  provider: AIProvider,
  input: SuggestFollowUpPromptInput,
): Promise<SuggestFollowUpTaskResult> {
  const result = await provider.completeStructured({
    system: buildSystemPrompt(input.companyContext.tone, input.companyContext.language),
    user: buildUserPrompt(input),
    schema: FollowUpSuggestionSchema,
    schemaName: "follow_up_suggestion",
  });

  return {
    suggestion: result.data,
    model: result.model,
    promptVersion: SUGGEST_FOLLOWUP_PROMPT_VERSION,
    latencyMs: result.latencyMs,
    usage: result.usage,
  };
}
