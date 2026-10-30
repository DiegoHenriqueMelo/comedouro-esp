import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("GET /health", () => {
  const app = buildApp();
  afterAll(() => app.close());

  it("Responde 200 com status ok", async () => {
    const resposta = await app.inject({ method: "GET", url: "/health" });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: "ok" });
  });
});
