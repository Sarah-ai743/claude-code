import type { ProposedAction, RiskLevel } from "./approvals.schema.js";

/**
 * Default risk when the caller does not state one.
 *
 * The ordering principle: risk is about how hard the action is to take back.
 * A message sent to a customer cannot be unsent; an internal status change can
 * be flipped back in a second.
 */
const RISK_BY_ACTION: Record<ProposedAction, RiskLevel> = {
  SEND_EMAIL: "HIGH", // leaves the building, reaches a customer, irreversible
  SEND_FOLLOW_UP: "HIGH",
  BOOK_MEETING: "MEDIUM", // commits someone's time, but can be rearranged
  UPDATE_CRM: "MEDIUM", // touches a system of record outside ours
  CHANGE_LEAD_STATUS: "LOW", // internal only, trivially reversible
};

export function deriveRiskLevel(action: ProposedAction): RiskLevel {
  return RISK_BY_ACTION[action];
}
