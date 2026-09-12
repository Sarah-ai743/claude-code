import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { TEST_API_TOKEN } from "../helpers/client.js";

const app = createApp();

/** One representative route per protected router. */
const PROTECTED = [
  ["get", "/api/activity"],
  ["get", "/api/approvals"],
  ["post", "/api/leads/analyze"],
  ["post", "/api/followups/suggest"],
  ["post", "/api/approvals"],
] as const;

describe("API token authentication", () => {
  describe("without a token", () => {
    it.each(PROTECTED)("rejects %s %s with 401", async (method, path) => {
      const response = await request(app)[method](path).send({});

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("MISSING_API_TOKEN");
      // The error tells an honest caller what to do, and a dishonest one nothing.
      expect(response.body.error.message).toMatch(/Authorization: Bearer/);
    });

    it("says how to authenticate in the WWW-Authenticate header", async () => {
      const response = await request(app).get("/api/activity");
      expect(response.headers["www-authenticate"]).toMatch(/Bearer/);
    });

    it("rejects before doing any work — no validation error leaks through", async () => {
      // A body that would fail validation must still come back as 401, not 422:
      // an unauthenticated caller learns nothing about the request format.
      const response = await request(app).post("/api/leads/analyze").send({ bogus: true });
      expect(response.status).toBe(401);
    });
  });

  describe("with a bad token", () => {
    it("rejects a wrong token", async () => {
      const response = await request(app)
        .get("/api/activity")
        .set("Authorization", "Bearer not-the-right-token-but-long-enough-to-look-real");

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("INVALID_API_TOKEN");
    });

    it("rejects a token that is a prefix of the real one", async () => {
      const response = await request(app)
        .get("/api/activity")
        .set("Authorization", `Bearer ${TEST_API_TOKEN.slice(0, -1)}`);

      expect(response.status).toBe(401);
    });

    it("rejects an empty bearer value", async () => {
      const response = await request(app).get("/api/activity").set("Authorization", "Bearer ");
      expect(response.status).toBe(401);
    });

    it("rejects the wrong scheme", async () => {
      const response = await request(app)
        .get("/api/activity")
        .set("Authorization", `Basic ${TEST_API_TOKEN}`);

      expect(response.status).toBe(401);
    });

    it("never echoes the presented token back", async () => {
      const secret = "some-token-that-should-never-be-repeated-back";
      const response = await request(app)
        .get("/api/activity")
        .set("Authorization", `Bearer ${secret}`);

      expect(JSON.stringify(response.body)).not.toContain(secret);
    });
  });

  describe("with a valid token", () => {
    it("accepts Authorization: Bearer", async () => {
      const response = await request(app)
        .get("/api/activity")
        .set("Authorization", `Bearer ${TEST_API_TOKEN}`);

      expect(response.status).toBe(200);
    });

    it("accepts the X-API-Token header too", async () => {
      const response = await request(app)
        .get("/api/activity")
        .set("X-API-Token", TEST_API_TOKEN);

      expect(response.status).toBe(200);
    });

    it("is case-insensitive about the Bearer scheme", async () => {
      const response = await request(app)
        .get("/api/activity")
        .set("Authorization", `bearer ${TEST_API_TOKEN}`);

      expect(response.status).toBe(200);
    });
  });

  describe("the health check stays public", () => {
    it("answers with no token at all", async () => {
      const response = await request(app).get("/api/health");

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe("ok");
    });

    it("volunteers nothing beyond liveness", async () => {
      const response = await request(app).get("/api/health");

      expect(Object.keys(response.body.data).sort()).toEqual(["status", "uptimeSeconds"]);
      // Which AI provider is configured is nobody else's business.
      expect(JSON.stringify(response.body)).not.toMatch(/anthropic|mock|production/i);
    });
  });

  it("never exposes the AI provider key, configured or not", async () => {
    const response = await request(app)
      .get("/api/activity")
      .set("Authorization", `Bearer ${TEST_API_TOKEN}`);

    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/sk-ant/);
    expect(body).not.toMatch(/ANTHROPIC_API_KEY/);
  });
});
