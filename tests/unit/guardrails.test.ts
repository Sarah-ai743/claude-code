import { describe, expect, it } from "vitest";
import {
  findUnsupportedPriceClaims,
  normalizeConfidence,
} from "../../src/modules/leads/leads.guardrails.js";

describe("findUnsupportedPriceClaims", () => {
  it("flags a price that appears only in the AI's reply", () => {
    const found = findUnsupportedPriceClaims(
      "A 3-bedroom clean is £150 and takes about four hours.",
      "Hi, I need my apartment cleaned next Friday. Can you tell me the price?",
    );
    expect(found).toEqual(["£150"]);
  });

  it("allows a price the customer themselves mentioned", () => {
    const found = findUnsupportedPriceClaims(
      "You mentioned a budget of £100 — that works for a standard clean.",
      "My budget is around £100, is that enough?",
    );
    expect(found).toEqual([]);
  });

  it("returns nothing when the reply quotes no amounts", () => {
    const found = findUnsupportedPriceClaims(
      "Thanks for getting in touch. Could you confirm the size of the apartment?",
      "I need my apartment cleaned. How much?",
    );
    expect(found).toEqual([]);
  });

  it("detects amounts written with a currency word", () => {
    const found = findUnsupportedPriceClaims("It will be 200 EUR.", "How much?");
    expect(found).toEqual(["200 EUR"]);
  });
});

describe("normalizeConfidence", () => {
  it("rounds to two decimals", () => {
    expect(normalizeConfidence(0.8765)).toBe(0.88);
  });

  it("clamps values outside 0–1", () => {
    expect(normalizeConfidence(1.4)).toBe(1);
    expect(normalizeConfidence(-0.2)).toBe(0);
  });
});
