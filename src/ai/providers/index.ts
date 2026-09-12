import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import type { AIProvider } from "../types.js";
import { AnthropicProvider } from "./anthropic.provider.js";
import { MockAIProvider } from "./mock.provider.js";

let provider: AIProvider | undefined;

/**
 * Chooses the provider from configuration, once, and reuses it.
 * Business code calls this; it never constructs a vendor client itself.
 */
export function getAIProvider(): AIProvider {
  if (!provider) {
    provider = env.AI_PROVIDER === "mock" ? new MockAIProvider() : new AnthropicProvider();
    logger.info({ provider: provider.name, model: env.AI_MODEL_DEFAULT }, "ai.provider_selected");
  }
  return provider;
}

/** Test helper: inject a provider, or reset back to the configured one. */
export function setAIProvider(next: AIProvider | undefined): void {
  provider = next;
}
