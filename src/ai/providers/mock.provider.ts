import { AIResponseError } from "../../lib/errors.js";
import type { AIProvider, StructuredRequest, StructuredResult } from "../types.js";

/**
 * A fake provider for tests and offline development. `AI_PROVIDER=mock` runs
 * the entire API with no API key, no network, no cost, and no waiting.
 *
 * IMPORTANT: the keyword rules below are a test fixture, not business logic.
 * They exist only to make the mock's output vary with its input so tests can
 * assert something meaningful. Real judgement happens in the model.
 */
export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  async completeStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const fixture = this.buildFixture(request.schemaName, request.user);

    // The mock holds itself to the same contract as a real provider: if its
    // canned answer does not satisfy the schema, that is an error.
    const validated = request.schema.safeParse(fixture);
    if (!validated.success) {
      throw new AIResponseError(
        `Mock provider has no valid fixture for schema "${request.schemaName}".`,
        validated.error,
      );
    }

    return {
      data: validated.data,
      model: "mock-model",
      latencyMs: 1,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  private buildFixture(schemaName: string, userPrompt: string): unknown {
    if (schemaName !== "lead_analysis") {
      return null;
    }

    const text = userPrompt.toLowerCase();
    const soon = /\b(today|tomorrow|urgent|asap|next friday|this week)\b/.test(text);
    const askedPrice = /\b(price|pricing|quote|cost|how much)\b/.test(text);

    return {
      temperature: soon && askedPrice ? "HOT" : askedPrice ? "WARM" : "COLD",
      intent: askedPrice ? "Requesting a price for a service" : "General enquiry",
      urgency: soon ? "HIGH" : "MEDIUM",
      mainNeed: "Service enquiry described in the customer message",
      recommendedAction: askedPrice
        ? "Reply with a quote after confirming the missing details"
        : "Reply to clarify what the customer needs",
      suggestedReply:
        "Hi, thanks for getting in touch. I'd be glad to help with this. " +
        "To give you an accurate price, could you confirm a few details? " +
        "I'll come back to you with a quote right away.",
      confidence: 0.75,
    };
  }
}
