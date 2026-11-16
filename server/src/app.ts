import { existsSync } from "node:fs";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyBaseLogger } from "fastify";
import { ZodError } from "zod";
import type { System } from "./composition.js";
import {
  ErroDeDominio,
  NaoEncontrado,
} from "./domain/shared/erro-de-dominio.js";
import {
  type AuthOptions,
  registerAuthRoutes,
  rejectForeignOrigin,
  requireUser,
  toUserDto,
} from "./http/auth-routes.js";
import {
  type PairingOptions,
  registerPairingRoutes,
} from "./http/pairing-routes.js";
import { registerPetRoutes } from "./http/pet-routes.js";
import { type PushDeps, registerRoutes } from "./http/routes.js";

export type AppOptions = {
  // O logger do servidor. Sem ele (nos testes), o app fica em silêncio.
  loggerInstance?: FastifyBaseLogger;
  system: System;
  push: PushDeps;
  auth: AuthOptions;
  pairing: PairingOptions;
  // A pasta com o build do PWA (web/dist). Sem ela, o servidor só responde a API.
  webDist?: string | null;
};

// Um corpo que não dá para ler: bytes fora do UTF-8, ou JSON quebrado.
class TextoInvalido extends Error {
  readonly statusCode = 400;
}

// Monta o Fastify sem abrir porta: os testes usam `app.inject()`, e o `main.ts` chama o `listen`.
export function buildApp(options: AppOptions) {
  const app = options.loggerInstance
    ? Fastify({ loggerInstance: options.loggerInstance })
    : Fastify({ logger: false });

  app.setErrorHandler((error: unknown, request, reply) => {
    // Não existe, ou é de outra conta: a resposta é a mesma (D17).
    if (error instanceof NaoEncontrado) {
      return reply.code(404).send({ motivo: "nao_encontrado" });
    }
    // Regra do domínio: o dado tem a forma certa, mas não faz sentido (422).
    if (error instanceof ErroDeDominio) {
      const status = error.codigo === "conflito_de_versao" ? 409 : 422;
      return reply
        .code(status)
        .send({ motivo: error.codigo, mensagem: error.message });
    }
    // Forma errada: campo faltando, tipo errado (400).
    if (error instanceof ZodError) {
      return reply.code(400).send({
        motivo: "requisicao_invalida",
        detalhes: error.issues.map((i) => ({
          campo: i.path.join("."),
          mensagem: i.message,
        })),
      });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (error instanceof TextoInvalido) {
      return reply.code(400).send({ motivo: "texto_invalido" });
    }
    if (statusCode === 413) {
      return reply.code(413).send({ motivo: "grande_demais" });
    }
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ motivo: "requisicao_invalida" });
    }
    // Erro inesperado: registra no log, e a resposta não leva detalhe nenhum.
    request.log.error({ err: error }, "erro inesperado");
    return reply.code(500).send({ motivo: "erro_interno" });
  });

  // JSON só em UTF-8 válido. O leitor padrão troca bytes inválidos por "�" sem avisar, e o nome
  // estragado ia parar no banco. Aqui, o pedido é recusado (400) e nada é salvo.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_request, body, done) => {
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(body as Buffer);
      } catch {
        return done(new TextoInvalido("o corpo não é UTF-8 válido"));
      }
      if (text.trim() === "") return done(null, undefined);
      try {
        done(null, JSON.parse(text));
      } catch {
        done(new TextoInvalido("o corpo não é um JSON válido"));
      }
    },
  );

  app.register(fastifyCookie);
  app.decorateRequest("user", null);
  app.addHook("onRequest", rejectForeignOrigin);

  app.get("/health", async () => ({ status: "ok" }));

  const { auth } = options.system;
  app.register(
    async (v1) => {
      // Abertas: login, sair e as opções da tela de login.
      await v1.register(registerAuthRoutes(auth, options.auth));
      // Aberta também: quem chama é o ESP32, que ainda não tem conta nem senha.
      await v1.register(
        registerPairingRoutes(
          options.system.catalog,
          options.system.clock,
          options.pairing,
        ),
      );

      // Todo o resto exige sessão.
      await v1.register(async (privateScope) => {
        privateScope.addHook("onRequest", requireUser(auth));
        privateScope.get("/eu", async (request) =>
          request.user ? toUserDto(request.user) : null,
        );
        await privateScope.register(
          registerRoutes(options.system, options.push),
        );
        await privateScope.register(registerPetRoutes(options.system.pets));
      });
    },
    { prefix: "/v1" },
  );

  const webDist = options.webDist;
  if (webDist && existsSync(webDist)) {
    app.register(fastifyStatic, {
      root: webDist,
      setHeaders: (reply, path) => {
        // O service worker e o HTML não podem ficar presos no cache do navegador.
        if (path.endsWith("sw.js") || path.endsWith(".html")) {
          reply.header("Cache-Control", "no-cache");
        }
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    const isApi = request.url.startsWith("/v1") || request.method !== "GET";
    if (isApi || !webDist || !existsSync(webDist)) {
      return reply.code(404).send({ motivo: "nao_encontrado" });
    }
    // Qualquer outra rota é do PWA: devolve o index.html.
    return reply.header("Cache-Control", "no-cache").sendFile("index.html");
  });

  return app;
}
