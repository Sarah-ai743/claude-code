import { Router } from "express";
import { env } from "../../config/env.js";

export const healthRouter: Router = Router();

healthRouter.get("/", (_req, res) => {
  res.status(200).json({
    data: {
      status: "ok",
      environment: env.NODE_ENV,
      aiProvider: env.AI_PROVIDER,
      uptimeSeconds: Math.round(process.uptime()),
    },
  });
});
