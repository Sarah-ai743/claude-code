import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { apiTokenAuth } from "../../src/middleware/apiTokenAuth.js";
import { TEST_API_TOKEN } from "../helpers/client.js";

function fakeRequest(headers: Record<string, string> = {}): Request {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    header: (name: string) => lower[name.toLowerCase()],
    requestId: "req_test",
    log: { warn: vi.fn() },
  } as unknown as Request;
}

function fakeResponse(): Response {
  return { setHeader: vi.fn() } as unknown as Response;
}

function run(headers: Record<string, string> = {}) {
  const next = vi.fn() as unknown as NextFunction;
  apiTokenAuth(fakeRequest(headers), fakeResponse(), next);
  return next as unknown as ReturnType<typeof vi.fn>;
}

describe("apiTokenAuth", () => {
  it("passes a valid token straight through", () => {
    const next = run({ Authorization: `Bearer ${TEST_API_TOKEN}` });
    expect(next).toHaveBeenCalledWith();
  });

  it("records which configured token matched, never the token itself", () => {
    const req = fakeRequest({ Authorization: `Bearer ${TEST_API_TOKEN}` });
    apiTokenAuth(req, fakeResponse(), vi.fn() as unknown as NextFunction);

    expect(req.apiTokenIndex).toBe(0);
    expect(JSON.stringify(req.apiTokenIndex)).not.toContain(TEST_API_TOKEN);
  });

  it("passes an error to the error handler rather than responding itself", () => {
    const next = run();
    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ status: 401, code: "MISSING_API_TOKEN" });
  });

  it("does not log the rejected token", () => {
    const req = fakeRequest({ Authorization: "Bearer a-token-that-is-wrong" });
    apiTokenAuth(req, fakeResponse(), vi.fn() as unknown as NextFunction);

    const warn = req.log.warn as unknown as ReturnType<typeof vi.fn>;
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("a-token-that-is-wrong");
  });

  it("tells the operator when no token is configured, and still refuses", async () => {
    // A server with no token configured must never fall open.
    vi.resetModules();
    vi.doMock("../../src/config/env.js", async () => {
      const actual = await vi.importActual<typeof import("../../src/config/env.js")>(
        "../../src/config/env.js",
      );
      return { ...actual, apiTokens: [] };
    });

    const { apiTokenAuth: unconfigured } = await import(
      "../../src/middleware/apiTokenAuth.js"
    );
    const next = vi.fn();
    unconfigured(
      fakeRequest({ Authorization: `Bearer ${TEST_API_TOKEN}` }),
      fakeResponse(),
      next as unknown as NextFunction,
    );

    expect(next.mock.calls[0]?.[0]).toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    });

    vi.doUnmock("../../src/config/env.js");
    vi.resetModules();
  });
});
