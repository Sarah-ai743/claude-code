import { describe, it, expect } from "vitest";
import { LeadAnalysisSchema, crossValidate } from "@/lib/ai/schema";

const validAnalysis = {
  language: "en",
  intent: "book a standard cleaning",
  requested_service: "Standard Cleaning",
  urgency: "medium" as const,
  qualification_status: "needs_information" as const,
  missing_information: ["preferred date"],
  sentiment: "positive" as const,
  recommended_action: "ask_question" as const,
  reply: "Happy to help! What date works best for you?",
  human_review_required: false,
  human_review_reason: null,
};

describe("LeadAnalysisSchema", () => {
  it("accepts a well-formed analysis", () => {
    const result = LeadAnalysisSchema.safeParse(validAnalysis);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid urgency enum value", () => {
    const result = LeadAnalysisSchema.safeParse({ ...validAnalysis, urgency: "urgent" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid qualification_status", () => {
    const result = LeadAnalysisSchema.safeParse({ ...validAnalysis, qualification_status: "closed" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid recommended_action", () => {
    const result = LeadAnalysisSchema.safeParse({ ...validAnalysis, recommended_action: "call_them" });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { reply, ...rest } = validAnalysis;
    void reply;
    const result = LeadAnalysisSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a non-boolean human_review_required", () => {
    const result = LeadAnalysisSchema.safeParse({ ...validAnalysis, human_review_required: "yes" });
    expect(result.success).toBe(false);
  });

  it("accepts a null requested_service and human_review_reason", () => {
    const result = LeadAnalysisSchema.safeParse({ ...validAnalysis, requested_service: null, human_review_reason: null });
    expect(result.success).toBe(true);
  });

  it("rejects malformed/garbage input entirely", () => {
    expect(LeadAnalysisSchema.safeParse("not an object").success).toBe(false);
    expect(LeadAnalysisSchema.safeParse(null).success).toBe(false);
    expect(LeadAnalysisSchema.safeParse([1, 2, 3]).success).toBe(false);
  });
});

describe("crossValidate", () => {
  it("flags human_review_required=true with no reason given", () => {
    const problems = crossValidate({ ...validAnalysis, human_review_required: true, human_review_reason: null });
    expect(problems.length).toBeGreaterThan(0);
  });

  it("flags human_handoff recommended without human_review_required", () => {
    const problems = crossValidate({ ...validAnalysis, recommended_action: "human_handoff", human_review_required: false });
    expect(problems.length).toBeGreaterThan(0);
  });

  it("flags qualification_status=human_required without human_review_required", () => {
    const problems = crossValidate({ ...validAnalysis, qualification_status: "human_required", human_review_required: false });
    expect(problems.length).toBeGreaterThan(0);
  });

  it("passes a fully consistent analysis", () => {
    expect(crossValidate(validAnalysis)).toHaveLength(0);
  });
});
