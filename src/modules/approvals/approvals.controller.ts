import type { Request, Response } from "express";
import * as approvalsService from "./approvals.service.js";
import type {
  ApproveRequest,
  CreateApprovalRequest,
  ListApprovalsQuery,
  RejectRequest,
} from "./approvals.schema.js";

export async function createApproval(req: Request, res: Response): Promise<void> {
  const input = req.body as CreateApprovalRequest;
  const approval = await approvalsService.createApproval(input, { requestId: req.requestId });

  res.status(201).json({
    data: approval,
    meta: { requestId: req.requestId },
  });
}

export async function listApprovals(req: Request, res: Response): Promise<void> {
  const query = req.validatedQuery as ListApprovalsQuery;
  const page = await approvalsService.listApprovals(query);

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

export async function approveApproval(req: Request, res: Response): Promise<void> {
  const input = req.body as ApproveRequest;
  const { approval, execution } = await approvalsService.approve(
    String(req.params.id),
    input,
    { requestId: req.requestId },
  );

  res.status(200).json({
    data: approval,
    meta: { requestId: req.requestId, execution },
  });
}

export async function rejectApproval(req: Request, res: Response): Promise<void> {
  const input = req.body as RejectRequest;
  const approval = await approvalsService.reject(String(req.params.id), input, {
    requestId: req.requestId,
  });

  res.status(200).json({
    data: approval,
    meta: { requestId: req.requestId },
  });
}
