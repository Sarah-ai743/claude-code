import { describe, expect, it } from "vitest";
import { redactMetadata, REDACTED } from "../../src/modules/audit/audit.redact.js";

describe("redactMetadata", () => {
  describe("by field name", () => {
    it.each([
      "apiKey",
      "api_key",
      "ANTHROPIC_API_KEY",
      "password",
      "accessToken",
      "authorization",
      "clientSecret",
      "sessionId",
      "privateKey",
      "cookie",
    ])("redacts %s", (key) => {
      expect(redactMetadata({ [key]: "whatever-the-value-is" })[key]).toBe(REDACTED);
    });

    it("leaves ordinary fields alone", () => {
      const output = redactMetadata({
        model: "claude-opus-5",
        riskLevel: "HIGH",
        latencyMs: 412,
        approved: true,
      });
      expect(output).toEqual({
        model: "claude-opus-5",
        riskLevel: "HIGH",
        latencyMs: 412,
        approved: true,
      });
    });
  });

  describe("by value shape, whatever the field is called", () => {
    it.each([
      ["harmless", "sk-ant-api03-abcdefghijklmnop"],
      ["note", "Authorization: Bearer abcdefghijklmnopqrstuvwxyz"],
      ["jwt", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature"],
      ["db", "postgresql://user:hunter2@localhost:5432/leadpilot"],
      ["aws", "AKIAIOSFODNN7EXAMPLE"],
      ["pem", "-----BEGIN RSA PRIVATE KEY-----\nMIIEow==\n"],
    ])("redacts a secret hiding in %s", (key, value) => {
      expect(redactMetadata({ [key]: value })[key]).toBe(REDACTED);
    });

    it("does not redact text that merely mentions a key", () => {
      const output = redactMetadata({ note: "The customer asked how much a deep clean costs" });
      expect(output.note).toBe("The customer asked how much a deep clean costs");
    });
  });

  it("reaches into nested objects and arrays", () => {
    const output = redactMetadata({
      provider: { name: "anthropic", apiKey: "sk-ant-abcdefghijklmnop" },
      attempts: [{ token: "abc" }, { status: "ok" }],
    });

    expect((output.provider as Record<string, unknown>).apiKey).toBe(REDACTED);
    expect((output.provider as Record<string, unknown>).name).toBe("anthropic");
    expect((output.attempts as Record<string, unknown>[])[0]?.token).toBe(REDACTED);
    expect((output.attempts as Record<string, unknown>[])[1]?.status).toBe("ok");
  });

  it("never modifies the object it was given", () => {
    const original = { apiKey: "sk-ant-abcdefghijklmnop" };
    redactMetadata(original);
    expect(original.apiKey).toBe("sk-ant-abcdefghijklmnop");
  });

  it("truncates very long strings instead of storing them forever", () => {
    const output = redactMetadata({ blob: "x".repeat(5000) });
    expect(String(output.blob)).toMatch(/…\[truncated\]$/);
    expect(String(output.blob).length).toBeLessThan(2100);
  });

  it("stops at a sane depth rather than recursing forever", () => {
    type Nested = { next?: Nested; apiKey?: string };
    const deep: Nested = {};
    let cursor = deep;
    for (let i = 0; i < 20; i += 1) {
      cursor.next = {};
      cursor = cursor.next;
    }
    expect(() => redactMetadata(deep as Record<string, unknown>)).not.toThrow();
  });

  it("handles null and undefined without crashing", () => {
    expect(redactMetadata({ a: null, b: undefined })).toEqual({ a: null, b: null });
  });
});
