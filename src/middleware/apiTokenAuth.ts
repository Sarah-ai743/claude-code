import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { apiTokens } from "../config/env.js";
import { ServiceUnavailableError, UnauthorizedError } from "../lib/errors.js";

/**
 * Server-to-server authentication with a shared secret.
 *
 * The token proves that a request comes from a system you trust — nothing more.
 * It does not identify a person, so it cannot answer "may THIS user see THIS
 * lead?". That needs per-user authentication, which is Phase 1. Until then,
 * anything holding this token can reach everything.
 *
 * Accepted on either header, because different clients make different ones easy:
 *   Authorization: Bearer <token>
 *   X-API-Token: <token>
 */
const BEARER = /^Bearer\s+(.+)$/i;

/**
 * Compares in constant time.
 *
 * A plain `===` returns as soon as two strings differ, so how long it takes
 * leaks how much of the token was correct — enough, over many attempts, to
 * recover it character by character. Hashing first gives two equal-length
 * buffers, so `timingSafeEqual` can be used whatever the input length is.
 */
function matches(presented: string, expected: string): boolean {
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function extractToken(req: Request): { token: string; source: string } | null {
  const authorization = req.header("authorization");
  const bearer = authorization?.match(BEARER);
  if (bearer?.[1]) {
    return { token: bearer[1].trim(), source: "authorization" };
  }

  const headerToken = req.header("x-api-token");
  if (headerToken?.trim()) {
    return { token: headerToken.trim(), source: "x-api-token" };
  }

  return null;
}

export function apiTokenAuth(req: Request, res: Response, next: NextFunction): void {
  // Never open by accident. With no token configured the API refuses to serve
  // rather than falling back to letting everyone in.
  if (apiTokens.length === 0) {
    next(
      new ServiceUnavailableError(
        "API authentication is not configured on this server. Set LEADPILOT_API_TOKEN.",
      ),
    );
    return;
  }

  const presented = extractToken(req);

  if (!presented) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="leadpilot"');
    next(
      new UnauthorizedError(
        "Missing API token. Send it as: Authorization: Bearer <token>",
        "MISSING_API_TOKEN",
      ),
    );
    return;
  }

  // Every configured token is checked, so rotation works: old and new are both
  // valid while callers move across.
  const index = apiTokens.findIndex((candidate) => matches(presented.token, candidate));

  if (index === -1) {
    // The token itself is never logged — only the fact that one was rejected.
    req.log?.warn(
      { requestId: req.requestId, source: presented.source },
      "auth.token_rejected",
    );
    res.setHeader("WWW-Authenticate", 'Bearer realm="leadpilot", error="invalid_token"');
    next(new UnauthorizedError("Invalid API token.", "INVALID_API_TOKEN"));
    return;
  }

  // Which token matched, not what it is. Useful when rotating: you can see
  // whether anything is still using the old one before you remove it.
  req.apiTokenIndex = index;
  next();
}
