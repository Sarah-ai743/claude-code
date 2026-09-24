import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "@/lib/env";
import type { BusinessContext, ConversationTurn } from "./prompt";

const FollowUpSchema = z.object({
  message: z.string().min(1).max(1000),
});

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 30_000 });
  return client;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON object found");
  return JSON.parse(candidate.slice(start, end + 1));
}

export interface GenerateFollowUpInput {
  business: BusinessContext;
  history: ConversationTurn[];
  leadLanguage: string | null;
  missingInformation: string[];
  attemptNumber: number;
}

/**
 * Generates a short follow-up nudge. Always returns a safe, generic
 * message if the AI call or parsing fails — a follow-up is never skipped
 * just because generation failed; it falls back to a plain check-in.
 */
export async function generateFollowUpMessage(input: GenerateFollowUpInput): Promise<{ message: string; usedFallback: boolean }> {
  const language = input.leadLanguage || "en";
  const fallback = `Hi again from ${input.business.name} — just checking in on your enquiry. Let us know if you have any questions or would like to move forward!`;

  const system = [
    "You write short, warm follow-up messages for a service business chasing an unanswered lead.",
    "Use ONLY the business context given. Never invent prices, availability, or promises.",
    `Write in language code: ${language}.`,
    "Keep it under 60 words. Reference what's still missing if relevant. No signature.",
    "Return ONLY JSON: {\"message\": string}",
  ].join("\n");

  const historyText = input.history.map((t) => `[${t.sender}]: ${t.content}`).join("\n");
  const user = [
    `Business: ${input.business.name} (${input.business.industry ?? "service business"})`,
    `This is follow-up attempt #${input.attemptNumber}.`,
    input.missingInformation.length ? `Still missing: ${input.missingInformation.join(", ")}` : "",
    "Conversation so far:",
    historyText || "(no prior messages)",
  ].join("\n");

  try {
    const response = await getClient().messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 300,
      system,
      messages: [{ role: "user", content: user }],
    });
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") throw new Error("no text");
    const parsed = FollowUpSchema.safeParse(extractJson(block.text));
    if (!parsed.success) throw new Error("schema mismatch");
    return { message: parsed.data.message, usedFallback: false };
  } catch {
    return { message: fallback, usedFallback: true };
  }
}
