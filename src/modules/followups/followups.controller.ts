import type { Request, Response } from "express";
import * as followupsService from "./followups.service.js";
import type { SuggestFollowUpRequest } from "./followups.schema.js";

export async function suggestFollowUp(req: Request, res: Response): Promise<void> {
  const input = req.body as SuggestFollowUpRequest;

  const result = await followupsService.suggestFollowUp(input, {
    requestId: req.requestId,
  });

  res.status(200).json({
    data: result.suggestion,
    meta: {
      requestId: req.requestId,
      ...result.meta,
    },
  });
}
