import { Router } from "express";

export const healthRouter: Router = Router();

/**
 * Public, and deliberately uninformative.
 *
 * This endpoint has no token requirement, because the hosting platform and any
 * uptime monitor must be able to reach it. So it answers exactly one question —
 * is the process alive — and volunteers nothing else. Which AI provider is
 * configured, and which environment this is, are not facts to hand to the
 * open internet.
 */
healthRouter.get("/", (_req, res) => {
  res.status(200).json({
    data: {
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
    },
  });
});
