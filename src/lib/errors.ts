/**
 * One error class per failure mode the API can produce.
 *
 * Services throw these; the error-handling middleware is the only place that
 * knows how to turn them into an HTTP response. That keeps business code free
 * of status codes, and guarantees every error leaves through the same door.
 */
export interface AppErrorOptions {
  status: number;
  code: string;
  details?: unknown[];
  cause?: unknown;
  /** Safe to show a user? If false, the client gets a generic message. */
  expose?: boolean;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown[];
  readonly expose: boolean;

  constructor(message: string, options: AppErrorOptions) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.status = options.status;
    this.code = options.code;
    this.details = options.details ?? [];
    this.expose = options.expose ?? true;
    Error.captureStackTrace?.(this, new.target);
  }
}

/** The request body did not match its schema. */
export class ValidationError extends AppError {
  constructor(message: string, details: unknown[] = []) {
    super(message, { status: 422, code: "VALIDATION_FAILED", details });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, { status: 404, code: "NOT_FOUND" });
  }
}

/** The AI provider was unreachable, errored, or timed out. */
export class AIProviderError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, { status: 502, code: "AI_PROVIDER_ERROR", cause });
  }
}

/** The provider replied, but the reply did not match the expected schema. */
export class AIResponseError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, { status: 502, code: "AI_INVALID_RESPONSE", cause });
  }
}

/** The model declined to answer (safety refusal). */
export class AIRefusalError extends AppError {
  constructor(message: string, details: unknown[] = []) {
    super(message, { status: 422, code: "AI_REFUSED_REQUEST", details });
  }
}

/** We are being rate limited by the upstream provider. */
export class AIRateLimitError extends AppError {
  constructor(message = "AI provider rate limit reached. Please retry shortly.") {
    super(message, { status: 429, code: "AI_RATE_LIMITED" });
  }
}
