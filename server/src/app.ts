import { existsSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyBaseLogger } from "fastify";
import { ZodError } from "zod";
import type { SimulatorControls } from "./application/ports.js";
import type { System } from "./composition.js";
import { ErroDeDominio } from "./domain/shared/erro-de-dominio.js";
import { type PushDeps, registerRoutes } from "./http/routes.js";

export type AppOptions = {
  // O logger do servidor. Sem ele (nos testes), o app fica em silêncio.
  loggerInstance?: FastifyBaseLogger;
  system: System;
  push: PushDeps;
  // A pasta com o build do PWA (web/dist). Sem ela, o servidor só responde a API.
  webDist?: string | null;
  // O dispositivo simulado, quando o servidor roda sem ESP32: libera a rota /v1/simulador.
  simulator?: SimulatorControls | null;
};

// Monta o Fastify sem abrir porta: os testes usam `app.inject()`, e o `main.ts` chama o `listen`.
export function buildApp(options: AppOptions) {
  const app = options.loggerInstance
    ? Fastify({ loggerInstance: options.loggerInstance })
    : Fastify({ logger: false });

  app.setErrorHandler((error: unknown, request, reply) => {
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
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ motivo: "requisicao_invalida" });
    }
    // Erro inesperado: registra no log, e a resposta não leva detalhe nenhum.
    request.log.error({ err: error }, "erro inesperado");
    return reply.code(500).send({ motivo: "erro_interno" });
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.register(
    registerRoutes(options.system, options.push, options.simulator ?? null),
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
