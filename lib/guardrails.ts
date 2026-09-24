/**
 * "Do not invent facts" is enforced in three places:
 *   1. The prompt tells the model the rules (the main defence).
 *   2. The output schema constrains what it can return at all.
 *   3. This file checks the result afterwards and flags anything suspicious.
 *
 * This check deliberately only *reports*. Silently rewriting a draft would
 * hide the problem; flagging it for human review is what actually keeps a
 * customer from being quoted a price nobody approved.
 */

/** Matches "£120", "120 EUR", "$1,500.00", "120 euros". */
const MONEY =
  /(?:[$£€]\s?\d[\d,.]*)|(?:\b\d[\d,.]*\s?(?:eur|usd|gbp|euros?|dollars?|pounds?)\b)/gi;

interface Amount {
  raw: string;
  key: string;
}

function canonicalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,]+$/, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    // "$1500.00" and "$1500" are the same amount — drop zero cents.
    .replace(/\.00$/, "");
}

function findAmounts(text: string): Amount[] {
  return (text.match(MONEY) ?? []).map((match) => {
    const raw = match.trim().replace(/[.,]+$/, "");
    return { raw, key: canonicalize(raw) };
  });
}

/**
 * Returns any monetary amount that appears in the AI's draft reply but
 * nowhere in the customer's message — i.e. a price the model may have
 * made up rather than taken from approved pricing rules.
 */
export function findUnsupportedPriceClaims(reply: string, customerMessage: string): string[] {
  const known = new Set(findAmounts(customerMessage).map((amount) => amount.key));
  const unsupported = new Map<string, string>();

  for (const amount of findAmounts(reply)) {
    if (!known.has(amount.key)) {
      unsupported.set(amount.key, amount.raw);
    }
  }

  return [...unsupported.values()];
}
