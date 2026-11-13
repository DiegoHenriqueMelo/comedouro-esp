import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { toConfigDto, toScheduleDto } from "../application/dto.js";
import type {
  Notifier,
  PushSubscriptionRepository,
  SimulatorControls,
} from "../application/ports.js";
import type { System } from "../composition.js";
import type { CommandResult } from "../domain/device/device.js";
import { TIME_ZONES } from "../domain/feeder/configuration.js";
import type { Feeder } from "../domain/feeder/feeder.js";

export type PushDeps = {
  // null quando as chaves VAPID não foram configuradas.
  publicKey: string | null;
  subscriptions: PushSubscriptionRepository;
  notifier: Notifier;
};

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

const simulatorSchema = z.object({
  tigelaGramas: z.number().min(0).max(1000).optional(),
  garrafaGramas: z.number().min(0).max(5000).optional(),
  balanca: z.boolean().optional(),
  nivel: z.boolean().optional(),
});

export function registerRoutes(
  system: System,
  push: PushDeps,
  simulator: SimulatorControls | null,
) {
  const { feeders, devices } = system;

  return async (app: FastifyInstance) => {
    app.get("/status", async () => ({
      ...(await devices.getStatus()),
      simulado: simulator !== null,
    }));

    // Só existe no modo simulado: mexe no "mundo físico" para testar recusas e avisos sem a placa.
    if (simulator) {
      let sensors = { scale: true, level: true };

      app.post("/simulador", async (request) => {
        const body = simulatorSchema.parse(request.body);
        if (body.tigelaGramas !== undefined) {
          simulator.setBowlGrams(body.tigelaGramas);
        }
        if (body.garrafaGramas !== undefined) {
          simulator.setBottleGrams(body.garrafaGramas);
        }
        if (body.balanca !== undefined || body.nivel !== undefined) {
          sensors = {
            scale: body.balanca ?? sensors.scale,
            level: body.nivel ?? sensors.level,
          };
          simulator.setSensors(sensors);
        }
        await devices.registerState(simulator.state());
        return { resultado: "aceito" };
      });
    }

    app.post("/feed", async (request, reply) => {
      const body = feedSchema.parse(request.body ?? {});
      const result = await devices.feedNow(body.porcoes, body.forcar);
      return sendResult(reply, result, 202);
    });

    app.get("/schedules", async () => scheduleResponse(await feeders.get()));

    app.put("/schedules", async (request) => {
      const items = scheduleSchema.parse(request.body);
      return scheduleResponse(await feeders.updateSchedule(items));
    });

    app.get("/config", async () => configResponse(await feeders.get()));

    app.put("/config", async (request) => {
      const dto = configSchema.parse(request.body);
      return configResponse(await feeders.updateConfiguration(dto));
    });

    app.get("/history", async (request) => {
      const { limit } = historyQuerySchema.parse(request.query);
      return devices.history(limit);
    });

    // Comandos de manutenção: vão para o dispositivo pelo mesmo caminho do "servir".
    app.post("/scale/tare", async (_request, reply) =>
      sendResult(reply, await devices.command({ type: "tara" }), 200),
    );

    app.post("/scale/calibrate", async (request, reply) => {
      const { gramas } = z
        .object({ gramas: z.number().positive().max(5000) })
        .parse(request.body);
      const result = await devices.command({
        type: "calibrar_balanca",
        grams: gramas,
      });
      return sendResult(reply, result, 200);
    });

    app.post("/calibrate", async (request, reply) => {
      const { porcoes } = z
        .object({ porcoes: z.number().int().min(1).max(30) })
        .parse(request.body);
      const result = await devices.command({
        type: "calibrar_dose",
        portions: porcoes,
      });
      return sendResult(reply, result, 200);
    });

    app.post("/servo/test", async (request, reply) => {
      const { angulo } = z
        .object({ angulo: z.number().min(0).max(180) })
        .parse(request.body);
      const result = await devices.command({
        type: "testar_servo",
        angle: angulo,
      });
      return sendResult(reply, result, 200);
    });

    app.post("/alerts/ack", async () => {
      await devices.acknowledgeAlerts();
      return { resultado: "aceito" };
    });

    // Notificações push (E12).
    app.get("/push/public-key", async () => ({ chave: push.publicKey }));

    app.post("/push/subscribe", async (request, reply) => {
      await push.subscriptions.add(subscriptionSchema.parse(request.body));
      return reply.code(201).send({ resultado: "aceito" });
    });

    app.post("/push/unsubscribe", async (request) => {
      const { endpoint } = z
        .object({ endpoint: z.string() })
        .parse(request.body);
      await push.subscriptions.remove(endpoint);
      return { resultado: "aceito" };
    });

    app.post("/push/test", async () => {
      await push.notifier.notify(
        "Comedouro",
        "Notificação de teste: está funcionando.",
      );
      return { resultado: "aceito" };
    });
  };
}
