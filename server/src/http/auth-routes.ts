import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  type AuthService,
  DEV_IDENTITY,
  SESSION_DAYS,
} from "../application/auth-service.js";
import type { User } from "../domain/user/user.js";

declare module "fastify" {
  interface FastifyRequest {
    // Quem está usando o app. Só é null nas rotas abertas (login e opções de login).
    user: User | null;
  }
}

export const SESSION_COOKIE = "sessao";

export type AuthOptions = {
  // O "ID do cliente OAuth" do Google Cloud Console. null: o botão do Google não aparece.
  googleClientId: string | null;
  // "Entrar como dev", sem Google. Nunca em produção.
  devLogin: boolean;
  // Cookie só por HTTPS. Ligado em produção.
  secureCookie: boolean;
};

const loginSchema = z.object({ credencial: z.string().min(1).max(4096) });

export function toUserDto(user: User) {
  return {
    id: user.id,
    nome: user.name,
    email: user.email,
    foto: user.picture,
  };
}

// As rotas abertas: quem ainda não entrou só alcança estas.
export function registerAuthRoutes(auth: AuthService, options: AuthOptions) {
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: options.secureCookie,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };

  const startSession = (
    reply: FastifyReply,
    result: { user: User; token: string },
  ) =>
    reply
      .setCookie(SESSION_COOKIE, result.token, cookieOptions)
      .send({ usuario: toUserDto(result.user) });

  return async (app: FastifyInstance) => {
    // O que a tela de login precisa saber para montar os botões.
    app.get("/sessao/opcoes", async () => ({
      google: options.googleClientId,
      dev: options.devLogin,
    }));

    app.post("/sessao", async (request, reply) => {
      if (!auth.googleEnabled) {
        return reply.code(503).send({ motivo: "login_google_desligado" });
      }
      const { credencial } = loginSchema.parse(request.body);
      const result = await auth.loginWithGoogle(credencial);
      if (!result) {
        return reply.code(401).send({ motivo: "credencial_invalida" });
      }
      return startSession(reply, result);
    });

    if (options.devLogin) {
      app.post("/sessao/dev", async (_request, reply) =>
        startSession(reply, await auth.loginAs(DEV_IDENTITY)),
      );
    }

    app.delete("/sessao", async (request, reply) => {
      await auth.logout(request.cookies[SESSION_COOKIE]);
      return reply.clearCookie(SESSION_COOKIE, { path: "/" }).code(204).send();
    });
  };
}

// O porteiro: toda rota registrada depois dele exige uma sessão válida.
export function requireUser(auth: AuthService) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await auth.authenticate(request.cookies[SESSION_COOKIE]);
    if (!user) {
      return reply.code(401).send({ motivo: "nao_autenticado" });
    }
    request.user = user;
  };
}

// Defesa contra CSRF, além do SameSite=Lax do cookie: um pedido que muda algo e vem de outro site é recusado.
export function rejectForeignOrigin(
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
) {
  const origin = request.headers.origin;
  const changes = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  if (changes && origin && !sameHost(origin, request.headers.host)) {
    reply.code(403).send({ motivo: "origem_invalida" });
    return;
  }
  done();
}

function sameHost(origin: string, host: string | undefined): boolean {
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
