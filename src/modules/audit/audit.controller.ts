import type { Request, Response } from "express";
import * as auditService from "./audit.service.js";
import type { ListActivityQuery } from "./audit.schema.js";

export async function listActivity(req: Request, res: Response): Promise<void> {
  const query = req.validatedQuery as ListActivityQuery;
  const page = await auditService.listActivity(query);

  res.status(200).json({
    data: page.items,
    meta: {
      requestId: req.requestId,
      count: page.items.length,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    },
  });
}
