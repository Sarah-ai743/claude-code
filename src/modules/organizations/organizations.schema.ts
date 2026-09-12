import { z } from "zod";
import { isValidTimeZone } from "../../lib/businessTime.js";

/**
 * Facts about the customer's own business, supplied by the frontend on each
 * request for now. Once organizations are stored in the database (Phase 1) this
 * will be loaded from the `organizations` table instead of being sent by the
 * client — the shape stays the same, which is why it lives here rather than
 * inside a single feature module.
 */
export const CompanyContextSchema = z.object({
  businessType: z
    .string()
    .trim()
    .min(2, "businessType must be at least 2 characters")
    .max(120),
  services: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  language: z.string().trim().min(2).max(40).default("English"),
});

export type CompanyContext = z.infer<typeof CompanyContextSchema>;

/**
 * The voice the drafted message should be written in. A fixed list rather than
 * free text on purpose: this value is interpolated into the model's
 * instructions, and an open string there is an invitation to prompt injection.
 */
export const CompanyToneSchema = z
  .enum(["FRIENDLY", "PROFESSIONAL", "CASUAL", "FORMAL", "DIRECT"])
  .default("FRIENDLY");

export const BusinessHoursSchema = z.object({
  startHour: z.number().int().min(0).max(23).default(9),
  endHour: z.number().int().min(1).max(24).default(17),
  /** 0 = Sunday … 6 = Saturday. */
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1, 2, 3, 4, 5]),
});

/** Company context plus everything scheduling a follow-up needs. */
export const SchedulingCompanyContextSchema = CompanyContextSchema.extend({
  tone: CompanyToneSchema,
  /** IANA name, e.g. "Europe/Berlin". Validated against the platform database. */
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isValidTimeZone, {
      message: 'timezone must be a valid IANA name, for example "Europe/Berlin"',
    })
    .default("UTC"),
  businessHours: BusinessHoursSchema.default({
    startHour: 9,
    endHour: 17,
    workingDays: [1, 2, 3, 4, 5],
  }),
}).refine((context) => context.businessHours.endHour > context.businessHours.startHour, {
  message: "businessHours.endHour must be after businessHours.startHour",
  path: ["businessHours"],
});

export type SchedulingCompanyContext = z.infer<typeof SchedulingCompanyContextSchema>;
