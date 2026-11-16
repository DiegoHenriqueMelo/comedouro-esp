import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { toConfigDto, toScheduleDto } from "../application/dto.js";
import type { FeederRuntime } from "../application/feeder-runtime.js";
import type {
  PushSubscriptionRepository,
  UserNotifier,
} from "../application/ports.js";
import type { System } from "../composition.js";
import type { CommandResult } from "../domain/device/device.js";
import { TIME_ZONES } from "../domain/feeder/configuration.js";
import type { Feeder } from "../domain/feeder/feeder.js";
import type { User } from "../domain/user/user.js";

export type PushDeps = {
  // null quando as chaves VAPID não foram configuradas.
  publicKey: string | null;
  subscriptions: PushSubscriptionRepository;
  notifier: UserNotifier;
};

declare module "fastify" {
  interface FastifyRequest {
    // O comedouro da rota /v1/comedouros/:id, já conferido: é do usuário logado.
    feeder: FeederRuntime | null;
  }
}

// A forma do dado (400). O sentido do dado é do domínio (422).
const scheduleSchema = z
  .array(
    z.object({
      hora: z.string(),
      porcoes: z.number(),
      ativo: z.boolean().default(true),
    }),
  )
  .max(50);

const configSchema = z.object({
  gramasPorPorcao: z.number(),
  limiteDiarioPorcoes: z.number(),
  intervaloMinimoMin: z.number(),
  limiteTigelaGramas: z.number(),
  fusoHorario: z.string(),
  alturaGarrafaMm: z.number(),
  anguloEncher: z.number(),
  anguloServir: z.number(),
});

const feedSchema = z.object({
  porcoes: z.number().default(1),
  forcar: z.boolean().default(false),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const subscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

const newFeederSchema = z.object({
  apelido: z.string().max(200),
  tipo: z.enum(["aparelho", "simulado"]),
});

const renameSchema = z.object({ apelido: z.string().max(200) });

const simulatorSchema = z.object({
  tigelaGramas: z.number().min(0).max(1000).optional(),
  garrafaGramas: z.number().min(0).max(5000).optional(),
  balanca: z.boolean().optional(),
  nivel: z.boolean().optional(),
});

function scheduleResponse(feeder: Feeder) {
  return { versao: feeder.version, agenda: toScheduleDto(feeder.schedule) };
}

function configResponse(feeder: Feeder) {
  return {
    versao: feeder.version,
    config: toConfigDto(feeder.configuration),
    fusos: Object.keys(TIME_ZONES),
  };
}

// O cartão de um comedouro na lista.
async function summary(runtime: FeederRuntime) {
  const { online } = await runtime.repositories.status.load();
  return {
    id: runtime.id,
    apelido: runtime.profile.nickname,
    tipo: runtime.profile.kind,
    criadoEm: runtime.profile.createdAt.toISOString(),
    online,
    alertas: (await runtime.alerts.list()).length,
  };
}

// Traduz a resposta do dispositivo em status HTTP (plano, seção 3.5).
function sendResult(reply: FastifyReply, result: CommandResult, ok: number) {
  switch (result.result) {
    case "aceito":
      return reply.code(ok).send({ resultado: "aceito" });
    case "recusado":
      return reply.code(429).send({ motivo: result.reason });
    case "ocupado":
      return reply.code(409).send({ motivo: "ocupado" });
    case "offline":
      return reply.code(503).send({ motivo: "alimentador_offline" });
  }
}

// Só existe dentro do escopo com sessão; o porteiro já garantiu o usuário.
function userOf(request: FastifyRequest): User {
  if (!request.user) throw new Error("rota com sessão chamada sem usuário");
  return request.user;
}

function feederOf(request: FastifyRequest): FeederRuntime {
  if (!request.feeder) throw new Error("rota de comedouro sem comedouro");
  return request.feeder;
}

export function registerRoutes(system: System, push: PushDeps) {
  const { catalog } = system;

  return async (app: FastifyInstance) => {
    app.decorateRequest("feeder", null);

    // Os comedouros da conta.
    app.get("/comedouros", async (request) => {
      const runtimes = await catalog.list(userOf(request).id);
      return {
        aparelhoDisponivel: catalog.supportsHardware,
        comedouros: await Promise.all(runtimes.map(summary)),
      };
    });

    app.post("/comedouros", async (request, reply) => {
      const body = newFeederSchema.parse(request.body);
      const { runtime, credential } = await catalog.create(
        userOf(request).id,
        body.apelido,
        body.tipo,
      );
      return reply
        .code(201)
        .send({ comedouro: await summary(runtime), credencial: credential });
    });

    // Tudo o que é de um comedouro só: /v1/comedouros/:id/...
    await app.register(
      async (one) => {
        one.addHook("preHandler", async (request) => {
          const { id } = request.params as { id: string };
          request.feeder = await catalog.get(userOf(request).id, id);
        });
        registerFeederRoutes(one, system);
      },
      { prefix: "/comedouros/:id" },
    );

    // Notificações push (E12): cada inscrição é do usuário logado.
    app.get("/push/public-key", async () => ({ chave: push.publicKey }));

    app.post("/push/subscribe", async (request, reply) => {
      await push.subscriptions.add(
        userOf(request).id,
        subscriptionSchema.parse(request.body),
      );
      return reply.code(201).send({ resultado: "aceito" });
    });

    app.post("/push/unsubscribe", async (request) => {
      const { endpoint } = z
        .object({ endpoint: z.string() })
        .parse(request.body);
      await push.subscriptions.remove(endpoint);
      return { resultado: "aceito" };
    });

    app.post("/push/test", async (request) => {
      await push.notifier.notify(
        userOf(request).id,
        "Comedouro",
        "Notificação de teste: está funcionando.",
      );
      return { resultado: "aceito" };
    });
  };
}

function registerFeederRoutes(app: FastifyInstance, system: System) {
  const { catalog } = system;

  app.get("/", async (request) => summary(feederOf(request)));

  app.patch("/", async (request) => {
    const { apelido } = renameSchema.parse(request.body);
    const runtime = feederOf(request);
    return summary(
      await catalog.rename(userOf(request).id, runtime.id, apelido),
    );
  });

  app.delete("/", async (request, reply) => {
    await catalog.remove(userOf(request).id, feederOf(request).id);
    return reply.code(204).send();
  });

  app.get("/status", async (request) => {
    const runtime = feederOf(request);
    return {
      ...(await runtime.devices.getStatus()),
      apelido: runtime.profile.nickname,
      tipo: runtime.profile.kind,
      simulado: runtime.profile.kind === "simulado",
    };
  });

  // Só nos simulados: mexe no "mundo físico" para testar recusas e avisos sem a placa.
  app.post("/simulador", async (request, reply) => {
    const runtime = feederOf(request);
    const simulator = runtime.simulator;
    if (!simulator) return reply.code(404).send({ motivo: "nao_encontrado" });

    const body = simulatorSchema.parse(request.body);
    if (body.tigelaGramas !== undefined) {
      simulator.setBowlGrams(body.tigelaGramas);
    }
    if (body.garrafaGramas !== undefined) {
      simulator.setBottleGrams(body.garrafaGramas);
    }
    if (body.balanca !== undefined || body.nivel !== undefined) {
      const current = simulator.state().sensors;
      simulator.setSensors({
        scale: body.balanca ?? current.scale,
        level: body.nivel ?? current.level,
      });
    }
    await runtime.devices.registerState(simulator.state());
    return { resultado: "aceito" };
  });

  app.post("/feed", async (request, reply) => {
    const body = feedSchema.parse(request.body ?? {});
    const result = await feederOf(request).devices.feedNow(
      body.porcoes,
      body.forcar,
    );
    return sendResult(reply, result, 202);
  });

  app.get("/schedules", async (request) =>
    scheduleResponse(await feederOf(request).feeders.get()),
  );

  app.put("/schedules", async (request) => {
    const items = scheduleSchema.parse(request.body);
    return scheduleResponse(
      await feederOf(request).feeders.updateSchedule(items),
    );
  });

  app.get("/config", async (request) =>
    configResponse(await feederOf(request).feeders.get()),
  );

  app.put("/config", async (request) => {
    const dto = configSchema.parse(request.body);
    return configResponse(
      await feederOf(request).feeders.updateConfiguration(dto),
    );
  });

  app.get("/history", async (request) => {
    const { limit } = historyQuerySchema.parse(request.query);
    return feederOf(request).devices.history(limit);
  });

  // Comandos de manutenção: vão para o dispositivo pelo mesmo caminho do "servir".
  app.post("/scale/tare", async (request, reply) =>
    sendResult(
      reply,
      await feederOf(request).devices.command({ type: "tara" }),
      200,
    ),
  );

  app.post("/scale/calibrate", async (request, reply) => {
    const { gramas } = z
      .object({ gramas: z.number().positive().max(5000) })
      .parse(request.body);
    const result = await feederOf(request).devices.command({
      type: "calibrar_balanca",
      grams: gramas,
    });
    return sendResult(reply, result, 200);
  });

  app.post("/calibrate", async (request, reply) => {
    const { porcoes } = z
      .object({ porcoes: z.number().int().min(1).max(30) })
      .parse(request.body);
    const result = await feederOf(request).devices.command({
      type: "calibrar_dose",
      portions: porcoes,
    });
    return sendResult(reply, result, 200);
  });

  app.post("/servo/test", async (request, reply) => {
    const { angulo } = z
      .object({ angulo: z.number().min(0).max(180) })
      .parse(request.body);
    const result = await feederOf(request).devices.command({
      type: "testar_servo",
      angle: angulo,
    });
    return sendResult(reply, result, 200);
  });

  app.post("/alerts/ack", async (request) => {
    await feederOf(request).devices.acknowledgeAlerts();
    return { resultado: "aceito" };
  });
}
