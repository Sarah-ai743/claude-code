import type { Request, Response } from "express";
import * as leadsService from "./leads.service.js";
import type { AnalyzeLeadRequest } from "./leads.schema.js";

/**
 * Reads the (already validated) request, calls the service, shapes the reply.
 * No business rules live here — if you find yourself writing an `if` about
 * leads in this file, it belongs in the service.
 */
export async function analyzeLead(req: Request, res: Response): Promise<void> {
  const input = req.body as AnalyzeLeadRequest;

  const result = await leadsService.analyzeLead(input, { requestId: req.requestId });

  res.status(200).json({
    data: result.analysis,
    meta: {
      requestId: req.requestId,
      ...result.meta,
    },
  });
}
