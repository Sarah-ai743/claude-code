import { Router } from "express";
import { validateBody } from "../../middleware/validate.js";
import { SuggestFollowUpRequestSchema } from "./followups.schema.js";
import * as followupsController from "./followups.controller.js";

export const followupsRouter: Router = Router();

followupsRouter.post(
  "/suggest",
  validateBody(SuggestFollowUpRequestSchema),
  followupsController.suggestFollowUp,
);
