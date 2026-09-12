import { z } from "zod";
import { EVENT_TYPES } from "./audit.types.js";

export const EventTypeSchema = z.enum(EVENT_TYPES);

/**
 * Filters for GET /api/activity.
 *
 * `date` is a whole UTC calendar day. That is a deliberate simplification worth
 * knowing about: activity timestamps are stored in UTC, so a business in Berlin
 * asking for "2026-09-12" gets 02:00 on the 12th to 02:00 on the 13th in its own
 * clock. When the frontend needs a local day, send explicit `from`/`to` bounds.
 */
export const ListActivityQuerySchema = z
  .object({
    leadId: z.string().trim().min(1).max(120).optional(),
    eventType: EventTypeSchema.optional(),
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be a calendar day, for example 2026-09-12")
      .optional(),
    from: z.iso.datetime({ message: "from must be an ISO-8601 timestamp" }).optional(),
    to: z.iso.datetime({ message: "to must be an ISO-8601 timestamp" }).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().trim().min(1).max(120).optional(),
  })
  .refine((query) => !(query.from && query.to) || query.from < query.to, {
    message: "from must be earlier than to",
    path: ["from"],
  });

export type ListActivityQuery = z.infer<typeof ListActivityQuerySchema>;
