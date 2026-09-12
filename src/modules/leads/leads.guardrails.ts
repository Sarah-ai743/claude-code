/**
 * "Do not invent facts" is enforced in three places:
 *
 *   1. The prompt tells the model the rules (the main defence).
 *   2. The output schema constrains what it can return at all.
 *   3. This file checks the result afterwards and flags anything suspicious.
 *
 * The check below deliberately only *reports*. Silently rewriting a draft would
 * hide the problem; a human is going to read this reply before it is sent, and
 * a logged warning is what tells you a prompt needs fixing.
 */

/** Matches "£120", "120 EUR", "$1,500.00", "120 euros". */
const MONEY =
  /(?:[$£€]\s?\d[\d,.]*)|(?:\b\d[\d,.]*\s?(?:eur|usd|gbp|euros?|dollars?|pounds?)\b)/gi;

interface Amount {
  /** As written, for reporting. */
  raw: string;
  /** Canonical form, for comparing. */
  key: string;
}

/**
 * "£1,500.00" and "£1500.00" are the same amount, and a trailing comma in
 * "around £100, is that ok?" is punctuation rather than part of the number.
 */
function canonicalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,]+$/, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "");
}

function findAmounts(text: string): Amount[] {
  return (text.match(MONEY) ?? []).map((match) => {
    const raw = match.trim().replace(/[.,]+$/, "");
    return { raw, key: canonicalize(raw) };
  });
}

/**
 * Returns any monetary amount that appears in the AI's draft reply but nowhere
 * in the customer's message — i.e. a price the model may have made up.
 */
export function findUnsupportedPriceClaims(
  suggestedReply: string,
  customerMessage: string,
): string[] {
  const known = new Set(findAmounts(customerMessage).map((amount) => amount.key));
  const unsupported = new Map<string, string>();

  for (const amount of findAmounts(suggestedReply)) {
    if (!known.has(amount.key)) {
      unsupported.set(amount.key, amount.raw);
    }
  }

  return [...unsupported.values()];
}

/** Keeps confidence inside 0–1 and to two decimals, whatever the model returns. */
export function normalizeConfidence(value: number): number {
  const bounded = Math.min(1, Math.max(0, value));
  return Math.round(bounded * 100) / 100;
}
