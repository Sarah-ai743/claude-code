import { describe, expect, it } from "vitest";
import { deriveRiskLevel } from "../../src/modules/approvals/approvals.risk.js";

describe("deriveRiskLevel", () => {
  it("treats anything that reaches a customer as high risk", () => {
    // An email cannot be unsent. That is what makes it high risk.
    expect(deriveRiskLevel("SEND_EMAIL")).toBe("HIGH");
    expect(deriveRiskLevel("SEND_FOLLOW_UP")).toBe("HIGH");
  });

  it("treats commitments in other systems as medium risk", () => {
    expect(deriveRiskLevel("BOOK_MEETING")).toBe("MEDIUM");
    expect(deriveRiskLevel("UPDATE_CRM")).toBe("MEDIUM");
  });

  it("treats a reversible internal change as low risk", () => {
    expect(deriveRiskLevel("CHANGE_LEAD_STATUS")).toBe("LOW");
  });
});
