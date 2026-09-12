import { Router } from "express";
import { validateBody } from "../../middleware/validate.js";
import { AnalyzeLeadRequestSchema } from "./leads.schema.js";
import * as leadsController from "./leads.controller.js";

/**
 * URL paths only. Express 5 forwards rejected promises from async handlers to
 * the error middleware automatically, so no try/catch is needed here.
 */
export const leadsRouter: Router = Router();

leadsRouter.post(
  "/analyze",
  validateBody(AnalyzeLeadRequestSchema),
  leadsController.analyzeLead,
);
