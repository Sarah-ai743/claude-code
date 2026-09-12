import request from "supertest";
import type { Express } from "express";

/**
 * The token the test suite authenticates with. It must match the value in
 * vitest.config.ts, and it is a throwaway fixture — not a secret, and not a
 * token any real environment would ever use.
 */
export const TEST_API_TOKEN =
  "test-token-0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * A supertest client that presents a valid API token on every request, so that
 * feature tests stay about the feature. Tests of authentication itself use
 * plain supertest, so they can send a bad token or none at all.
 */
export function authed(app: Express) {
  const auth = (test: request.Test) => test.set("Authorization", `Bearer ${TEST_API_TOKEN}`);

  return {
    get: (url: string) => auth(request(app).get(url)),
    post: (url: string) => auth(request(app).post(url)),
    patch: (url: string) => auth(request(app).patch(url)),
    delete: (url: string) => auth(request(app).delete(url)),
  };
}
