import Fastify from "fastify";

type OpcoesDoApp = {
  logger?: boolean;
};

export function buildApp(opcoes: OpcoesDoApp = {}) {
  const app = Fastify({ logger: opcoes.logger ?? false });

  app.get("/health", async (request, reply) => {
    return { status: "ok" };
  });

  return app;
}
