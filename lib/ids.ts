import { randomUUID } from "node:crypto";

/**
 * Prefixed identifiers: `apr_3f2c…`, `act_9b1e…`.
 *
 * The prefix means an id is self-describing in a log line, a URL, or a support
 * message — you can tell what someone is looking at without asking.
 */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
