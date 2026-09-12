import { z } from "zod";

/**
 * The HTTP input contract for POST /api/leads/analyze.
 *
 * Everything arriving from Base44 is untrusted until it has been through here.
 * Unknown fields are stripped, strings are trimmed, and sizes are bounded so a
 * huge body cannot be used to run up an AI bill.
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

export const AnalyzeLeadRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(10, "message must be at least 10 characters to analyze")
    .max(5000, "message must be 5000 characters or fewer"),
  customerName: z.string().trim().min(1).max(120).optional(),
  companyContext: CompanyContextSchema,
});

export type AnalyzeLeadRequest = z.infer<typeof AnalyzeLeadRequestSchema>;
