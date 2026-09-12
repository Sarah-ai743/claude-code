import type { Request, Response } from "express";
import * as emailsService from "./emails.service.js";
import type { InboundEmail } from "./emails.schema.js";

export async function ingestEmail(req: Request, res: Response): Promise<void> {
  const email = req.body as InboundEmail;

  const result = await emailsService.ingestEmail(email, { requestId: req.requestId });

  // Always 200 for anything the provider should not retry — including a
  // duplicate, which is a success from their point of view. A non-2xx reply
  // makes most providers send the same email again.
  res.status(200).json({
    data: {
      outcome: result.outcome,
      leadId: result.leadId,
      leadCreated: result.leadCreated,
      approvalId: result.approvalId,
      analysis: result.analysis,
    },
    meta: {
      requestId: req.requestId,
      replySent: false,
      note: "No email was sent. Drafts wait for human approval.",
    },
  });
}
