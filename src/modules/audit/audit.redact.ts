/**
 * Keeps secrets out of the activity log.
 *
 * The log is the one place in the system that is never deleted, so anything
 * that lands here lands here permanently. Metadata is written by our own code,
 * so this is defence in depth rather than the first line of it — but "someone
 * will one day pass the wrong object" is a safe assumption, and a leaked key in
 * an append-only table cannot be taken back.
 *
 * Two independent checks: the NAME of a field, and the SHAPE of its value.
 */

const SENSITIVE_KEY = /(?:api[-_]?key|secret|password|passwd|token|authorization|auth|credential|private[-_]?key|session|cookie|signature)/i;

/** Values that look like credentials whatever they are called. */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{12,}/, // Anthropic / OpenAI style keys
  /\bBearer\s+[A-Za-z0-9._-]{16,}/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, // JWT
  /\bpostgres(?:ql)?:\/\/[^\s]*:[^\s]*@/i, // connection string with a password
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export const REDACTED = "[Redacted]";

const MAX_DEPTH = 6;
const MAX_STRING_LENGTH = 2_000;
const MAX_ARRAY_LENGTH = 100;

function redactString(value: string): string {
  if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
    return REDACTED;
  }
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`
    : value;
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[MaxDepth]";
  if (value === null || value === undefined) return null;

  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((entry) => redactValue(entry, depth + 1));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactValue(nested, depth + 1);
    }
    return output;
  }

  // Functions, symbols, bigints: nothing worth auditing.
  return String(value);
}

/** Returns a copy safe to store forever. The input is never modified. */
export function redactMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return redactValue(metadata, 0) as Record<string, unknown>;
}
