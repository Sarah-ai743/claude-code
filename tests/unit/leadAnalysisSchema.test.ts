import { describe, expect, it } from "vitest";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { LeadAnalysisSchema } from "../../src/ai/tasks/analyzeLead.task.js";

const validAnalysis = {
  temperature: "HOT",
  intent: "Requesting a price for apartment cleaning",
  urgency: "HIGH",
  mainNeed: "3-bedroom apartment cleaned next Friday",
  recommendedAction: "Confirm the address and send a quote today",
  suggestedReply: "Hi Anna, thanks for getting in touch...",
  confidence: 0.9,
};

describe("LeadAnalysisSchema", () => {
  it("accepts a well-formed analysis", () => {
    expect(LeadAnalysisSchema.safeParse(validAnalysis).success).toBe(true);
  });

  it("rejects an unknown temperature", () => {
    const result = LeadAnalysisSchema.safeParse({ ...validAnalysis, temperature: "LUKEWARM" });
    expect(result.success).toBe(false);
  });

  it("rejects a confidence outside 0–1", () => {
    expect(LeadAnalysisSchema.safeParse({ ...validAnalysis, confidence: 87 }).success).toBe(false);
  });

  it("rejects empty text fields", () => {
    expect(LeadAnalysisSchema.safeParse({ ...validAnalysis, intent: "" }).success).toBe(false);
  });

  it("converts to a JSON schema the model can be constrained to", () => {
    const format = betaZodOutputFormat(LeadAnalysisSchema);
    const schema = format.schema as {
      required: string[];
      additionalProperties: boolean;
    };

    expect(format.type).toBe("json_schema");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required.sort()).toEqual([
      "confidence",
      "intent",
      "mainNeed",
      "recommendedAction",
      "suggestedReply",
      "temperature",
      "urgency",
    ]);
  });
});
