import { beforeEach, describe, expect, it } from "vitest";
import {
  FakeIdentityVerifier,
  FixedClock,
  MemorySessionRepository,
  MemoryUserRepository,
} from "../infra/memory/memory-repositories.js";
import { AuthService, hashToken } from "./auth-service.js";

const ana = {
  sub: "google-ana",
  email: "ana@example.com",
  name: "Ana",
  picture: null,
};

const DAY = 24 * 60;

describe("AuthService", () => {
  let clock: FixedClock;
  let users: MemoryUserRepository;
  let sessions: MemorySessionRepository;
  let google: FakeIdentityVerifier;
  let auth: AuthService;

  beforeEach(() => {
    clock = new FixedClock(new Date("2026-11-16T12:00:00.000Z"));
    users = new MemoryUserRepository();
    sessions = new MemorySessionRepository();
    google = new FakeIdentityVerifier();
    google.accept("credencial-da-ana", ana);
    auth = new AuthService(users, sessions, google, clock);
  });

  describe("login com Google", () => {
    it("credencial que o Google não confirma não entra", async () => {
      expect(await auth.loginWithGoogle("falsa")).toBeNull();
    });

    it("o primeiro login cria a conta; o segundo reaproveita a mesma", async () => {
      const first = await auth.loginWithGoogle("credencial-da-ana");
      const second = await auth.loginWithGoogle("credencial-da-ana");

      expect(first?.user.email).toBe("ana@example.com");
      expect(second?.user.id).toBe(first?.user.id);
      expect(second?.token).not.toBe(first?.token);
    });

    it("o login traz o nome novo do Google", async () => {
      await auth.loginWithGoogle("credencial-da-ana");
      google.accept("credencial-nova", { ...ana, name: "Ana Souza" });

      const result = await auth.loginWithGoogle("credencial-nova");

      expect((await users.findById(result?.user.id ?? ""))?.name).toBe(
        "Ana Souza",
      );
    });

    it("sem Google configurado, ninguém entra por ele", async () => {
      const semGoogle = new AuthService(users, sessions, null, clock);

      expect(semGoogle.googleEnabled).toBe(false);
      expect(await semGoogle.loginWithGoogle("credencial-da-ana")).toBeNull();
    });
  });

  describe("sessão", () => {
    it("o token abre a sessão de quem fez login", async () => {
      const login = await auth.loginWithGoogle("credencial-da-ana");

      const user = await auth.authenticate(login?.token);

      expect(user?.id).toBe(login?.user.id);
    });

    it("o banco guarda só o hash do token, nunca o token", async () => {
      const login = await auth.loginWithGoogle("credencial-da-ana");
      const token = login?.token ?? "";

      expect(await sessions.find(token)).toBeNull();
      expect(await sessions.find(hashToken(token))).not.toBeNull();
    });

    it("sem token ou com token desconhecido, não há usuário", async () => {
      expect(await auth.authenticate(undefined)).toBeNull();
      expect(await auth.authenticate("inventado")).toBeNull();
    });

    it("depois de 30 dias sem uso, a sessão vence", async () => {
      const login = await auth.loginWithGoogle("credencial-da-ana");

      clock.advanceMinutes(30 * DAY);

      expect(await auth.authenticate(login?.token)).toBeNull();
    });

    it("usar o app renova a sessão: quem abre todo dia não precisa entrar de novo", async () => {
      const login = await auth.loginWithGoogle("credencial-da-ana");

      for (let day = 0; day < 40; day++) {
        clock.advanceMinutes(DAY);
        expect(await auth.authenticate(login?.token)).not.toBeNull();
      }
    });

    it("sair encerra a sessão", async () => {
      const login = await auth.loginWithGoogle("credencial-da-ana");

      await auth.logout(login?.token);

      expect(await auth.authenticate(login?.token)).toBeNull();
    });
  });
});
