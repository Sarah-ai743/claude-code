import { Router } from "express";
import { validateQuery } from "../../middleware/validate.js";
import { ListActivityQuerySchema } from "./audit.schema.js";
import * as auditController from "./audit.controller.js";

export const activityRouter: Router = Router();

activityRouter.get("/", validateQuery(ListActivityQuerySchema), auditController.listActivity);
