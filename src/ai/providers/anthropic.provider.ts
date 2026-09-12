import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import {
  AIProviderError,
  AIRateLimitError,
  AIRefusalError,
  AIResponseError,
} from "../../lib/errors.js";
import type { AIProvider, StructuredRequest, StructuredResult } from "../types.js";

/**
 * The only file in the codebase that imports the Anthropic SDK.
 *
 * The API key is read from the environment and passed to the SDK here. It is
 * never logged, never returned in a response, and never appears in source.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(apiKey: string = env.ANTHROPIC_API_KEY ?? "") {
    if (!apiKey) {
      throw new AIProviderError("ANTHROPIC_API_KEY is not configured.");
    }
    this.client = new Anthropic({
      apiKey,
      maxRetries: env.AI_MAX_RETRIES,
      timeout: env.AI_TIMEOUT_MS,
    });
  }

  async completeStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const startedAt = Date.now();

    try {
      const response = await this.client.beta.messages.parse({
        model: env.AI_MODEL_DEFAULT,
        max_tokens: request.maxOutputTokens ?? env.AI_MAX_OUTPUT_TOKENS,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
        output_config: { effort: env.AI_EFFORT },
        // Constrains the model to our exact JSON shape.
        output_format: betaZodOutputFormat(request.schema),
      });

      // A model may decline a request on safety grounds. That is a 200 response
      // with no usable content, so it has to be checked before reading output.
      // (This SDK version does not surface `stop_details`, so the category is
      // not available to pass along — only the fact of the refusal.)
      if (response.stop_reason === "refusal") {
        throw new AIRefusalError("The AI model declined to analyze this message.");
      }

      if (response.stop_reason === "max_tokens") {
        throw new AIResponseError("The AI response was cut off before it was complete.");
      }

      if (response.parsed_output === null) {
        throw new AIResponseError("The AI returned no structured output.");
      }

      // Belt and braces: the provider already validated against the schema, but
      // we re-check on our side so nothing unvalidated reaches business logic.
      const validated = request.schema.safeParse(response.parsed_output);
      if (!validated.success) {
        throw new AIResponseError(
          "The AI response did not match the expected structure.",
          validated.error,
        );
      }

      const latencyMs = Date.now() - startedAt;

      // Usage logging: this is how you answer "why is the AI bill so high?"
      logger.info(
        {
          provider: this.name,
          schema: request.schemaName,
          model: response.model,
          latencyMs,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        "ai.completion",
      );

      return {
        data: validated.data,
        model: response.model,
        latencyMs,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      // Our own errors pass straight through.
      if (
        error instanceof AIRefusalError ||
        error instanceof AIResponseError ||
        error instanceof AIProviderError
      ) {
        throw error;
      }

      // Typed SDK errors, most specific first.
      if (error instanceof Anthropic.RateLimitError) {
        throw new AIRateLimitError();
      }
      if (error instanceof Anthropic.AuthenticationError) {
        // The key is wrong — an operator problem, never shown to the caller.
        logger.error({ provider: this.name }, "ai.auth_failed");
        throw new AIProviderError("AI provider authentication failed.", error);
      }
      if (error instanceof Anthropic.APIConnectionTimeoutError) {
        throw new AIProviderError("The AI provider timed out.", error);
      }
      if (error instanceof Anthropic.AnthropicError && /Failed to parse/i.test(error.message)) {
        throw new AIResponseError("The AI returned malformed JSON.", error);
      }
      if (error instanceof Anthropic.APIError) {
        throw new AIProviderError(`AI provider error (${error.status}).`, error);
      }

      throw new AIProviderError("Unexpected AI provider failure.", error);
    }
  }
}
