import { analyzeLeadTask, type LeadAnalysis } from "../../ai/tasks/analyzeLead.task.js";
import { getAIProvider } from "../../ai/providers/index.js";
import { logger } from "../../lib/logger.js";
import type { AnalyzeLeadRequest } from "./leads.schema.js";
import { findUnsupportedPriceClaims, normalizeConfidence } from "./leads.guardrails.js";

export interface AnalyzeLeadResult {
  analysis: LeadAnalysis;
  meta: {
    model: string;
    promptVersion: string;
    latencyMs: number;
  };
}

/**
 * The business rules. Knows nothing about HTTP: no request, no response, no
 * status codes. That is what makes it callable from a background job later, and
 * testable without starting a server.
 */
export async function analyzeLead(
  input: AnalyzeLeadRequest,
  context: { requestId: string },
): Promise<AnalyzeLeadResult> {
  const provider = getAIProvider();

  const result = await analyzeLeadTask(provider, {
    message: input.message,
    customerName: input.customerName,
    companyContext: input.companyContext,
  });

  const analysis: LeadAnalysis = {
    ...result.analysis,
    confidence: normalizeConfidence(result.analysis.confidence),
  };

  // Post-check for invented facts. Reported, never silently rewritten.
  const invented = findUnsupportedPriceClaims(analysis.suggestedReply, input.message);
  if (invented.length > 0) {
    logger.warn(
      {
        requestId: context.requestId,
        promptVersion: result.promptVersion,
        model: result.model,
        amounts: invented,
      },
      "lead.analysis.unsupported_price_claim",
    );
  }

  logger.info(
    {
      requestId: context.requestId,
      temperature: analysis.temperature,
      urgency: analysis.urgency,
      confidence: analysis.confidence,
      model: result.model,
      promptVersion: result.promptVersion,
      latencyMs: result.latencyMs,
      messageLength: input.message.length,
    },
    "lead.analysis.completed",
  );

  return {
    analysis,
    meta: {
      model: result.model,
      promptVersion: result.promptVersion,
      latencyMs: result.latencyMs,
    },
  };
}
