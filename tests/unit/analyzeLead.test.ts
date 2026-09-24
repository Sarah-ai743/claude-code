import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BusinessContext } from "@/lib/ai/prompt";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

const { analyzeLead } = await import("@/lib/ai/analyzeLead");

const business: BusinessContext = {
  name: "Sparkle Cleaning Co",
  industry: "Residential cleaning",
  description: "We clean homes.",
  brandTone: "friendly",
  aiInstructions: null,
  services: [{ name: "Standard Cleaning", description: "Full home clean", pricingNote: "$120 flat" }],
  serviceAreas: ["Austin, TX"],
  faqs: [{ question: "Do you bring supplies?", answer: "Yes, all included." }],
  pricingRules: ["Standard cleaning: $120 flat rate for homes up to 1500 sq ft"],
  qualificationQuestions: ["What is your home's square footage?"],
  bookingUrl: "https://example.com/book",
  languages: ["en", "es"],
  currency: "USD",
  country: "US",
};

function textResponse(json: unknown, model = "claude-opus-4-5") {
  return { model, content: [{ type: "text", text: JSON.stringify(json) }] };
}

const validOutput = {
  language: "en",
  intent: "book a standard cleaning",
  requested_service: "Standard Cleaning",
  urgency: "medium",
  qualification_status: "needs_information",
  missing_information: ["square footage"],
  sentiment: "positive",
  recommended_action: "ask_question",
  reply: "Happy to help! What's your home's square footage?",
  human_review_required: false,
  human_review_reason: null,
};

beforeEach(() => {
  mockCreate.mockReset();
});

describe("analyzeLead", () => {
  it("returns validated structured output for a well-formed model response", async () => {
    mockCreate.mockResolvedValueOnce(textResponse(validOutput));

    const result = await analyzeLead({
      customerMessage: "Hi, I'd like a quote for a standard clean.",
      customerName: "Jane",
      history: [],
      business,
    });

    expect(result.usedFallback).toBe(false);
    expect(result.analysis.qualification_status).toBe("needs_information");
    expect(result.analysis.reply).toContain("square footage");
  });

  it("falls back safely when the model returns malformed JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      model: "claude-opus-4-5",
      content: [{ type: "text", text: "Sure! Here's my answer: {not valid json at all" }],
    });

    const result = await analyzeLead({
      customerMessage: "Hi there",
      history: [],
      business,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.analysis.human_review_required).toBe(true);
    expect(result.analysis.recommended_action).toBe("human_handoff");
    expect(result.analysis.reply.length).toBeGreaterThan(0);
  });

  it("falls back safely when the model returns valid JSON that fails schema validation", async () => {
    mockCreate.mockResolvedValueOnce(
      textResponse({ ...validOutput, urgency: "asap", qualification_status: "super qualified" }),
    );

    const result = await analyzeLead({ customerMessage: "hi", history: [], business });

    expect(result.usedFallback).toBe(true);
    expect(result.analysis.human_review_required).toBe(true);
  });

  it("falls back safely when the AI provider call throws (API failure)", async () => {
    mockCreate.mockRejectedValueOnce(new Error("connection reset"));

    const result = await analyzeLead({ customerMessage: "hi", history: [], business });

    expect(result.usedFallback).toBe(true);
    expect(result.analysis.human_review_required).toBe(true);
    expect(result.analysis.human_review_reason).toMatch(/AI provider call failed/);
  });

  it("never throws — a lead is never lost even on total AI failure", async () => {
    mockCreate.mockRejectedValueOnce(new Error("boom"));
    await expect(analyzeLead({ customerMessage: "hi", history: [], business })).resolves.toBeDefined();
  });

  it("forces human review when the reply contains an unsupported price claim", async () => {
    mockCreate.mockResolvedValueOnce(
      textResponse({
        ...validOutput,
        human_review_required: false,
        human_review_reason: null,
        reply: "Sure, that will be $999 total.",
      }),
    );

    const result = await analyzeLead({
      customerMessage: "How much for a standard clean?",
      history: [],
      business,
    });

    expect(result.guardrailWarnings).toContain("$999");
    expect(result.analysis.human_review_required).toBe(true);
  });

  it("handles multilingual input and preserves the detected language", async () => {
    mockCreate.mockResolvedValueOnce(
      textResponse({
        ...validOutput,
        language: "es",
        reply: "¡Claro! ¿Cuál es el tamaño de su casa?",
      }),
    );

    const result = await analyzeLead({
      customerMessage: "Hola, necesito una cotización para limpieza.",
      history: [],
      business,
    });

    expect(result.analysis.language).toBe("es");
    expect(result.usedFallback).toBe(false);
  });

  it("works when the business has not configured any knowledge yet", async () => {
    mockCreate.mockResolvedValueOnce(
      textResponse({
        ...validOutput,
        qualification_status: "human_required",
        recommended_action: "human_handoff",
        human_review_required: true,
        human_review_reason: "No services configured for this business yet.",
      }),
    );

    const emptyBusiness: BusinessContext = {
      ...business,
      services: [],
      pricingRules: [],
      faqs: [],
      qualificationQuestions: [],
    };

    const result = await analyzeLead({ customerMessage: "What do you offer?", history: [], business: emptyBusiness });
    expect(result.analysis.human_review_required).toBe(true);
  });
});
