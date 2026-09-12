import type { ZodType } from "zod";

/**
 * The boundary between "our application" and "whichever AI vendor we use".
 *
 * Business code never imports a vendor SDK. It asks for a structured result
 * that matches a Zod schema, and this interface is the only thing it knows.
 * Swapping providers, or running fully offline in tests, is then a config
 * change rather than a code change.
 */
export interface StructuredRequest<T> {
  /** Instructions and rules for the model. */
  system: string;
  /** The specific input to reason about. */
  user: string;
  /** The exact shape the answer must have. Enforced twice: by the provider and by us. */
  schema: ZodType<T>;
  /** Label used in logs and metrics only. */
  schemaName: string;
  maxOutputTokens?: number;
}

export interface StructuredResult<T> {
  data: T;
  model: string;
  latencyMs: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface AIProvider {
  readonly name: string;
  completeStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}
