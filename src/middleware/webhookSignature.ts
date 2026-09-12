import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { ServiceUnavailableError, UnauthorizedError } from "../lib/errors.js";

/**
 * Verifies that an inbound webhook really came from your email provider.
 *
 * This endpoint cannot use the normal API token: an email provider has no way
 * to know it. Instead the provider and this server share a secret, the provider
 * signs each request body with it, and we recompute that signature here. A
 * forged request fails because the attacker cannot produce a valid signature
 * without the secret.
 *
 * The signature is computed over the RAW body bytes, before JSON parsing —
 * re-serializing parsed JSON would produce different bytes (key order,
 * whitespace) and the signature would never match.
 */
const SIGNATURE_HEADER = "x-webhook-signature";

export function verifyWebhookSignature(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const secret = env.EMAIL_WEBHOOK_SECRET;

  // Never open by accident: with no secret configured this endpoint refuses to
  // serve rather than accepting anything that arrives.
  if (!secret) {
    next(
      new ServiceUnavailableError(
        "Inbound email is not configured on this server. Set EMAIL_WEBHOOK_SECRET.",
      ),
    );
    return;
  }

  const presented = req.header(SIGNATURE_HEADER);
  if (!presented) {
    next(
      new UnauthorizedError(
        `Missing webhook signature. Send it in the ${SIGNATURE_HEADER} header.`,
        "MISSING_WEBHOOK_SIGNATURE",
      ),
    );
    return;
  }

  if (!req.rawBody) {
    next(new UnauthorizedError("Webhook body could not be verified.", "INVALID_WEBHOOK_SIGNATURE"));
    return;
  }

  const expected = createHmac("sha256", secret).update(req.rawBody).digest("hex");
  // Accept "sha256=<hex>" as well as a bare hex digest — providers differ.
  const normalized = presented.trim().replace(/^sha256=/i, "");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(normalized, "utf8");

  // Constant time, and length-checked first because timingSafeEqual throws on
  // mismatched lengths.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    // The presented signature is not logged: it is attacker-controlled input
    // and there is nothing useful in it.
    req.log?.warn({ requestId: req.requestId }, "webhook.signature_rejected");
    next(new UnauthorizedError("Invalid webhook signature.", "INVALID_WEBHOOK_SIGNATURE"));
    return;
  }

  next();
}
