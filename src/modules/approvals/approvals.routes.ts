import { Router } from "express";
import { validateBody, validateQuery } from "../../middleware/validate.js";
import {
  ApproveRequestSchema,
  CreateApprovalRequestSchema,
  ListApprovalsQuerySchema,
  RejectRequestSchema,
} from "./approvals.schema.js";
import * as approvalsController from "./approvals.controller.js";

export const approvalsRouter: Router = Router();

approvalsRouter.post(
  "/",
  validateBody(CreateApprovalRequestSchema),
  approvalsController.createApproval,
);

approvalsRouter.get(
  "/",
  validateQuery(ListApprovalsQuerySchema),
  approvalsController.listApprovals,
);

approvalsRouter.post(
  "/:id/approve",
  validateBody(ApproveRequestSchema),
  approvalsController.approveApproval,
);

approvalsRouter.post(
  "/:id/reject",
  validateBody(RejectRequestSchema),
  approvalsController.rejectApproval,
);
