import { z } from "zod";
import { CompanyContextSchema } from "../organizations/organizations.schema.js";

/**
 * The HTTP input contract for POST /api/leads/analyze.
 *
 * Everything arriving from Base44 is untrusted until it has been through here.
 * Unknown fields are stripped, strings are trimmed, and sizes are bounded so a
 * huge body cannot be used to run up an AI bill.
 *
 * `CompanyContextSchema` is shared with the other modules that need it — see
 * modules/organizations/organizations.schema.ts.
 */
export { CompanyContextSchema };

export const AnalyzeLeadRequestSchema = z.object({
  /** Optional: ties the resulting activity entry to a lead when you have one. */
  leadId: z.string().trim().min(1).max(120).optional(),
  message: z
    .string()
    .trim()
    .min(10, "message must be at least 10 characters to analyze")
    .max(5000, "message must be 5000 characters or fewer"),
  customerName: z.string().trim().min(1).max(120).optional(),
  companyContext: CompanyContextSchema,
});

export type AnalyzeLeadRequest = z.infer<typeof AnalyzeLeadRequestSchema>;
