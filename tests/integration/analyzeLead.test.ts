import { describe, expect, it, afterEach } from "vitest";
import { createApp } from "../../src/app.js";
import { authed } from "../helpers/client.js";
import { setAIProvider } from "../../src/ai/providers/index.js";
import type { AIProvider } from "../../src/ai/types.js";

const app = createApp();
// Every request below carries a valid API token — see tests/helpers/client.ts.
const api = authed(app);

const validPayload = {
  message:
    "Hi, I need my apartment cleaned next Friday. It has 3 bedrooms. Can you tell me the price?",
  customerName: "Anna",
  companyContext: {
    businessType: "Cleaning Company",
    services: ["Home Cleaning", "End of Tenancy Cleaning"],
    language: "English",
  },
};

afterEach(() => {
  // Undo any provider injected by a test.
  setAIProvider(undefined);
});

describe("POST /api/leads/analyze", () => {
  it("returns a structured analysis for a valid enquiry", async () => {
    const response = await api.post("/api/leads/analyze").send(validPayload);

    expect(response.status).toBe(200);

    const { data, meta } = response.body;

    expect(Object.keys(data).sort()).toEqual([
      "confidence",
      "intent",
      "mainNeed",
      "recommendedAction",
      "suggestedReply",
      "temperature",
      "urgency",
    ]);

    expect(["HOT", "WARM", "COLD"]).toContain(data.temperature);
    expect(["HIGH", "MEDIUM", "LOW"]).toContain(data.urgency);
    expect(typeof data.intent).toBe("string");
    expect(data.intent.length).toBeGreaterThan(0);
    expect(typeof data.mainNeed).toBe("string");
    expect(typeof data.recommendedAction).toBe("string");
    expect(typeof data.suggestedReply).toBe("string");
    expect(data.confidence).toBeGreaterThanOrEqual(0);
    expect(data.confidence).toBeLessThanOrEqual(1);

    expect(meta.requestId).toMatch(/^req_/);
    expect(meta.promptVersion).toBe("analyze-lead.v1");
    expect(meta.model).toBeTruthy();
  });

  it("echoes a correlation id on every response", async () => {
    const response = await api.post("/api/leads/analyze").send(validPayload);
    expect(response.headers["x-request-id"]).toMatch(/^req_/);
  });

  it("rejects a request with no message", async () => {
    const response = await api
      .post("/api/leads/analyze")
      .send({ companyContext: validPayload.companyContext });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.error.details.map((d: { field: string }) => d.field)).toContain(
      "message",
    );
    expect(response.body.error.requestId).toMatch(/^req_/);
  });

  it("rejects a message that is too short to analyze", async () => {
    const response = await api
      .post("/api/leads/analyze")
      .send({ ...validPayload, message: "hi" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a request with no company context", async () => {
    const response = await api
      .post("/api/leads/analyze")
      .send({ message: validPayload.message });

    expect(response.status).toBe(422);
    expect(response.body.error.details.map((d: { field: string }) => d.field)).toContain(
      "companyContext",
    );
  });

  it("applies defaults for optional company context fields", async () => {
    const response = await api
      .post("/api/leads/analyze")
      .send({
        message: validPayload.message,
        companyContext: { businessType: "Cleaning Company" },
      });

    expect(response.status).toBe(200);
  });

  it("returns 502 with a safe message when the AI provider fails", async () => {
    const brokenProvider: AIProvider = {
      name: "broken",
      async completeStructured() {
        throw new Error("connection reset by peer");
      },
    };
    setAIProvider(brokenProvider);

    const response = await api.post("/api/leads/analyze").send(validPayload);

    expect(response.status).toBe(500);
    // The internal error text must never reach the client.
    expect(JSON.stringify(response.body)).not.toContain("connection reset");
  });

  it("maps a provider error to a 502 with a stable error code", async () => {
    const { AIProviderError } = await import("../../src/lib/errors.js");
    setAIProvider({
      name: "broken",
      async completeStructured() {
        throw new AIProviderError("The AI provider timed out.");
      },
    });

    const response = await api.post("/api/leads/analyze").send(validPayload);

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("AI_PROVIDER_ERROR");
  });
});

describe("routing basics", () => {
  it("reports health", async () => {
    const response = await api.get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("ok");
  });

  it("returns a structured 404 for unknown routes", async () => {
    const response = await api.get("/api/does-not-exist");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects other methods on the analyze route", async () => {
    const response = await api.get("/api/leads/analyze");
    expect(response.status).toBe(404);
  });
});
