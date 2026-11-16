import { afterEach, describe, expect, it } from "vitest";
import { buildTestSystem } from "../test-support.js";

type TestSystem = Awaited<ReturnType<typeof buildTestSystem>>;

const bia = {
  sub: "google-bia",
  email: "bia@example.com",
  name: "Bia",
  picture: "https://example.com/bia.jpg",
};

function sessionCookie(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return (header ?? "").split(";")[0] ?? "";
}

describe("login e sessão", () => {
  let t: TestSystem;

  afterEach(() => t.app.close());

  it("sem sessão, a API responde 401", async () => {
    t = await buildTestSystem();

    const res = await t.app.inject({ method: "GET", url: "/v1/status" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ motivo: "nao_autenticado" });
  });

  it("com um cookie inventado, também 401", async () => {
    t = await buildTestSystem();

    const res = await t.app.inject({
      method: "GET",
      url: "/v1/status",
      headers: { cookie: "sessao=inventado" },
    });

    expect(res.statusCode).toBe(401);
  });

  it("o /health continua aberto: é ele que o Docker consulta", async () => {
    t = await buildTestSystem();

    const res = await t.app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
  });

  it("GET /v1/sessao/opcoes diz quais botões a tela de login mostra", async () => {
    t = await buildTestSystem({ auth: { devLogin: true } });

    const res = await t.app.inject({ method: "GET", url: "/v1/sessao/opcoes" });

    expect(res.json()).toEqual({
      google: "id-de-teste.apps.googleusercontent.com",
      dev: true,
    });
  });

  it("entrar com Google devolve o usuário e um cookie protegido, que abre a API", async () => {
    t = await buildTestSystem();
    t.google.accept("credencial-da-bia", bia);

    const login = await t.app.inject({
      method: "POST",
      url: "/v1/sessao",
      payload: { credencial: "credencial-da-bia" },
    });

    expect(login.statusCode).toBe(200);
    expect(login.json().usuario).toMatchObject({
      nome: "Bia",
      email: "bia@example.com",
      foto: "https://example.com/bia.jpg",
    });
    const header = String(login.headers["set-cookie"]);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");

    const me = await t.app.inject({
      method: "GET",
      url: "/v1/eu",
      headers: { cookie: sessionCookie(login.headers["set-cookie"]) },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe("bia@example.com");
  });

  it("credencial que o Google não confirma → 401", async () => {
    t = await buildTestSystem();

    const res = await t.app.inject({
      method: "POST",
      url: "/v1/sessao",
      payload: { credencial: "falsa" },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ motivo: "credencial_invalida" });
  });

  it("sem a credencial no corpo → 400", async () => {
    t = await buildTestSystem();

    const res = await t.app.inject({
      method: "POST",
      url: "/v1/sessao",
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it("sair apaga o cookie, e o token antigo deixa de valer", async () => {
    t = await buildTestSystem();

    const logout = await t.inject({ method: "DELETE", url: "/v1/sessao" });
    expect(logout.statusCode).toBe(204);
    expect(String(logout.headers["set-cookie"])).toContain("sessao=;");

    const res = await t.inject({ method: "GET", url: "/v1/status" });
    expect(res.statusCode).toBe(401);
  });

  describe("entrar como dev", () => {
    it("fora de produção, entra sem Google", async () => {
      t = await buildTestSystem({ auth: { devLogin: true } });

      const res = await t.app.inject({ method: "POST", url: "/v1/sessao/dev" });

      expect(res.statusCode).toBe(200);
      expect(res.json().usuario.email).toBe("dev@localhost");
    });

    it("desligado, a rota nem existe", async () => {
      t = await buildTestSystem({ auth: { devLogin: false } });

      const res = await t.app.inject({ method: "POST", url: "/v1/sessao/dev" });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("pedidos vindos de outro site (CSRF)", () => {
    it("um POST com Origin de outro site é recusado com 403", async () => {
      t = await buildTestSystem();

      const res = await t.inject({
        method: "POST",
        url: "/v1/feed",
        payload: { porcoes: 1 },
        headers: {
          origin: "https://site-malicioso.example",
          host: "app.local",
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ motivo: "origem_invalida" });
    });

    it("um POST do próprio site passa", async () => {
      t = await buildTestSystem();

      const res = await t.inject({
        method: "POST",
        url: "/v1/alerts/ack",
        headers: { origin: "https://app.local", host: "app.local" },
      });

      expect(res.statusCode).toBe(200);
    });
  });
});
