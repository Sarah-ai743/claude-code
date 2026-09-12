import type { NextFunction, Request, Response } from "express";
import { NotFoundError } from "../lib/errors.js";

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`No route matches ${req.method} ${req.originalUrl}`));
}
