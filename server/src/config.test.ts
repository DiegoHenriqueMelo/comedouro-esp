import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("configuração do login", () => {
  it("fora de produção: 'Entrar como dev' ligado e cookie sem exigir HTTPS", () => {
    expect(loadConfig({}).auth).toEqual({
      googleClientId: null,
      devLogin: true,
      secureCookie: false,
    });
  });

  it("em produção: sem 'Entrar como dev' e cookie só por HTTPS", () => {
    const { auth } = loadConfig({
      NODE_ENV: "production",
      GOOGLE_CLIENT_ID: "abc.apps.googleusercontent.com",
    });

    expect(auth).toEqual({
      googleClientId: "abc.apps.googleusercontent.com",
      devLogin: false,
      secureCookie: true,
    });
  });

  it("DEV_LOGIN e COOKIE_SECURE mandam mais que o NODE_ENV", () => {
    const { auth } = loadConfig({
      NODE_ENV: "production",
      DEV_LOGIN: "true",
      COOKIE_SECURE: "false",
    });

    expect(auth.devLogin).toBe(true);
    expect(auth.secureCookie).toBe(false);
  });

  it("um valor que não é true nem false é recusado na partida", () => {
    expect(() => loadConfig({ DEV_LOGIN: "sim" })).toThrow();
  });
});
