import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { LeadAnalysisSchema, crossValidate, type LeadAnalysis } from "./schema";
import { buildSystemPrompt, buildUserPrompt, ANALYZE_LEAD_PROMPT_VERSION, type AnalyzeLeadInput } from "./prompt";
import { findUnsupportedPriceClaims } from "@/lib/guardrails";

export interface AnalyzeLeadResult {
  analysis: LeadAnalysis;
  promptVersion: string;
  model: string;
  latencyMs: number;
  /** True when Claude's raw output failed schema validation and a safe fallback was substituted. */
  usedFallback: boolean;
  guardrailWarnings: string[];
}

const FALLBACK_REASON = "The AI response could not be validated, so this enquiry was routed to a human for safety.";

function safeFallback(input: AnalyzeLeadInput, reason: string): LeadAnalysis {
  return {
    language: "en",
    intent: "unable to determine automatically",
    requested_service: null,
    urgency: "medium",
    qualification_status: "human_required",
    missing_information: [],
    sentiment: "neutral",
    recommended_action: "human_handoff",
    reply: `Thanks for reaching out to ${input.business.name}. A member of our team will get back to you shortly.`,
    human_review_required: true,
    human_review_reason: reason,
  };
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 });
  }
  return client;
}

/**
 * Extracts a JSON object from a model response. Claude is instructed to
 * return raw JSON, but this defends against stray markdown fences or
 * leading/trailing prose without ever trusting anything beyond the first
 * balanced `{...}` block.
 */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in AI response");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Analyzes a customer enquiry for one business. Never throws on malformed
 * or unsafe AI output — always returns a valid, safe `LeadAnalysis`,
 * falling back to human review when the model can't be trusted.
 */
export async function analyzeLead(input: AnalyzeLeadInput): Promise<AnalyzeLeadResult> {
  const startedAt = Date.now();

  let raw: string;
  let modelUsed = env.ANTHROPIC_MODEL;
  try {
    const response = await getClient().messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1500,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    });
    modelUsed = response.model;
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("AI response contained no text content");
    }
    raw = textBlock.text;
  } catch (error) {
    // API failure (network, rate limit, auth, timeout): never lose the lead.
    return {
      analysis: safeFallback(input, `AI provider call failed: ${(error as Error).message}`),
      promptVersion: ANALYZE_LEAD_PROMPT_VERSION,
      model: modelUsed,
      latencyMs: Date.now() - startedAt,
      usedFallback: true,
      guardrailWarnings: [],
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = extractJson(raw);
  } catch {
    return {
      analysis: safeFallback(input, FALLBACK_REASON),
      promptVersion: ANALYZE_LEAD_PROMPT_VERSION,
      model: modelUsed,
      latencyMs: Date.now() - startedAt,
      usedFallback: true,
      guardrailWarnings: [],
    };
  }

  const validated = LeadAnalysisSchema.safeParse(parsedJson);
  if (!validated.success) {
    return {
      analysis: safeFallback(input, FALLBACK_REASON),
      promptVersion: ANALYZE_LEAD_PROMPT_VERSION,
      model: modelUsed,
      latencyMs: Date.now() - startedAt,
      usedFallback: true,
      guardrailWarnings: [],
    };
  }

  let analysis = validated.data;
  const businessRuleProblems = crossValidate(analysis);
  if (businessRuleProblems.length > 0) {
    // Contradictory but schema-valid output: force the safe side rather than trust it blindly.
    analysis = { ...analysis, human_review_required: true, human_review_reason: analysis.human_review_reason ?? businessRuleProblems.join("; ") };
  }

  const guardrailWarnings = findUnsupportedPriceClaims(analysis.reply, input.customerMessage);
  if (guardrailWarnings.length > 0) {
    analysis = {
      ...analysis,
      human_review_required: true,
      human_review_reason: analysis.human_review_reason ?? "Reply mentions a price not present in the customer's message or business pricing rules — needs human verification.",
    };
  }

  return {
    analysis,
    promptVersion: ANALYZE_LEAD_PROMPT_VERSION,
    model: modelUsed,
    latencyMs: Date.now() - startedAt,
    usedFallback: false,
    guardrailWarnings,
  };
}
