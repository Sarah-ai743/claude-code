import { z } from "zod";

/**
 * LeadPilot's own inbound email shape.
 *
 * Every email provider uses a different JSON format. Rather than teach the
 * pipeline about any of them, providers are translated into THIS shape by a
 * small adapter, and the pipeline only ever sees this. Changing provider then
 * means writing one adapter, not touching the feature.
 */
export const EmailAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(500),
  contentType: z.string().trim().min(1).max(200).optional(),
  /** Size in bytes. */
  size: z.number().int().min(0).max(1_000_000_000).optional(),
});

export const InboundEmailSchema = z.object({
  /**
   * The provider's unique id for this email. This is what stops the same
   * message being processed twice when a provider retries.
   */
  messageId: z.string().trim().min(1).max(500),

  from: z.object({
    email: z.email({ message: "from.email must be a valid email address" }).max(320),
    name: z.string().trim().min(1).max(200).optional(),
  }),

  to: z.email({ message: "to must be a valid email address" }).max(320),

  subject: z.string().trim().max(500).default(""),

  /** The readable body. Required — this is what gets analyzed. */
  textBody: z
    .string()
    .trim()
    .min(1, "textBody is required — there is nothing to analyze without it")
    .max(100_000),

  /** Accepted so a UI could render it later. Never analyzed, never stored. */
  htmlBody: z.string().max(500_000).optional(),

  receivedAt: z.iso.datetime({ message: "receivedAt must be an ISO-8601 timestamp" }),

  /** Metadata only. Attachment CONTENT is never accepted or stored. */
  attachments: z.array(EmailAttachmentSchema).max(50).default([]),
});

export type InboundEmail = z.infer<typeof InboundEmailSchema>;
export type EmailAttachment = z.infer<typeof EmailAttachmentSchema>;

export type IngestOutcome = "PROCESSED" | "DUPLICATE_IGNORED" | "RECEIVED_ANALYSIS_FAILED";
