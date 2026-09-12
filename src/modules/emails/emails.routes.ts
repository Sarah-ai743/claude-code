import { Router } from "express";
import { validateBody } from "../../middleware/validate.js";
import { verifyWebhookSignature } from "../../middleware/webhookSignature.js";
import { InboundEmailSchema } from "./emails.schema.js";
import * as emailsController from "./emails.controller.js";

export const emailsRouter: Router = Router();

/**
 * Order matters: the signature is checked BEFORE the body is validated, so an
 * unsigned caller learns nothing about the expected format.
 */
emailsRouter.post(
  "/inbound",
  verifyWebhookSignature,
  validateBody(InboundEmailSchema),
  emailsController.ingestEmail,
);
