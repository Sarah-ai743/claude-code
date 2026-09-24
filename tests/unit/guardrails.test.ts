import { describe, it, expect } from "vitest";
import { findUnsupportedPriceClaims } from "@/lib/guardrails";

describe("guardrails: findUnsupportedPriceClaims", () => {
  it("flags a price in the reply that the customer never mentioned", () => {
    const flagged = findUnsupportedPriceClaims(
      "Sure, that will be $250 for the deep clean.",
      "I need a deep clean for my 2 bedroom apartment.",
    );
    expect(flagged).toContain("$250");
  });

  it("does not flag a price the customer already stated", () => {
    const flagged = findUnsupportedPriceClaims(
      "Got it — confirming the $250 quote you mentioned.",
      "I saw online it's $250 for a deep clean, is that right?",
    );
    expect(flagged).toHaveLength(0);
  });

  it("treats different formatting of the same amount as supported", () => {
    const flagged = findUnsupportedPriceClaims(
      "That would be £1,500.00 total.",
      "Is it around £1500 total?",
    );
    expect(flagged).toHaveLength(0);
  });

  it("returns no flags when no prices are mentioned", () => {
    expect(findUnsupportedPriceClaims("Thanks, we'll be in touch soon!", "When can you come?")).toHaveLength(0);
  });

  it("flags multiple unsupported amounts", () => {
    const flagged = findUnsupportedPriceClaims(
      "Standard is $100 and deep clean is $200.",
      "What are your prices?",
    );
    expect(flagged.length).toBe(2);
  });
});
