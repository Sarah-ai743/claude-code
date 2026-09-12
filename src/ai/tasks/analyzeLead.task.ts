import { z } from "zod";
import type { AIProvider } from "../types.js";
import {
  ANALYZE_LEAD_PROMPT_VERSION,
  buildSystemPrompt,
  buildUserPrompt,
  type AnalyzeLeadPromptInput,
} from "../prompts/analyzeLead.prompt.js";

/**
 * The contract for what the AI must return. The provider constrains the model
 * to this shape, and we validate against it again on the way back.
 */
export const LeadAnalysisSchema = z.object({
  temperature: z
    .enum(["HOT", "WARM", "COLD"])
    .describe("How close this lead is to buying"),
  intent: z
    .string()
    .min(1)
    .max(300)
    .describe("What the customer is trying to achieve, in one short phrase"),
  urgency: z
    .enum(["HIGH", "MEDIUM", "LOW"])
    .describe("How quickly this enquiry needs a reply"),
  mainNeed: z
    .string()
    .min(1)
    .max(500)
    .describe("The concrete thing the customer needs, taken only from their message"),
  recommendedAction: z
    .string()
    .min(1)
    .max(500)
    .describe("The single next step the business should take"),
  suggestedReply: z
    .string()
    .min(1)
    .max(4000)
    .describe("A draft reply for a human to review, in the requested language"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("How confident the analysis is, from 0 to 1"),
});

export type LeadAnalysis = z.infer<typeof LeadAnalysisSchema>;

export interface AnalyzeLeadTaskResult {
  analysis: LeadAnalysis;
  model: string;
  promptVersion: string;
  latencyMs: number;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * A *task* is named after the business outcome, not the vendor or the prompt.
 * It owns the prompt, the output schema, and nothing else. It has no idea that
 * HTTP, Express, or a database exist.
 */
export async function analyzeLeadTask(
  provider: AIProvider,
  input: AnalyzeLeadPromptInput,
): Promise<AnalyzeLeadTaskResult> {
  const result = await provider.completeStructured({
    system: buildSystemPrompt(input.companyContext.language),
    user: buildUserPrompt(input),
    schema: LeadAnalysisSchema,
    schemaName: "lead_analysis",
  });

  return {
    analysis: result.data,
    model: result.model,
    promptVersion: ANALYZE_LEAD_PROMPT_VERSION,
    latencyMs: result.latencyMs,
    usage: result.usage,
  };
}
