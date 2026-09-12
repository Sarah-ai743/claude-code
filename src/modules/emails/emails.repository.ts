/**
 * Remembers which emails have already been handled.
 *
 * Providers retry: if your server is slow, asleep, or errors once, the same
 * email arrives again. Without this, one customer email would become two leads,
 * two analyses and two approval requests.
 *
 * TEMPORARY STORAGE — in the process, so this memory is lost on restart. A
 * redeploy could therefore let one already-processed email through a second
 * time. That moves to a unique database column in Phase 1, which is the real
 * fix; this comment is honest about the gap rather than hiding it.
 */
export interface ProcessedEmailRepository {
  /**
   * Atomically claims a message id. Returns true if this caller got the claim,
   * false if it was already taken — so the check and the write cannot race.
   */
  claim(messageId: string): Promise<boolean>;
  has(messageId: string): Promise<boolean>;
}

export class InMemoryProcessedEmailRepository implements ProcessedEmailRepository {
  private readonly seen = new Set<string>();

  async claim(messageId: string): Promise<boolean> {
    if (this.seen.has(messageId)) return false;
    this.seen.add(messageId);
    return true;
  }

  async has(messageId: string): Promise<boolean> {
    return this.seen.has(messageId);
  }

  /** Test helper. */
  clear(): void {
    this.seen.clear();
  }
}

export const processedEmailRepository = new InMemoryProcessedEmailRepository();
