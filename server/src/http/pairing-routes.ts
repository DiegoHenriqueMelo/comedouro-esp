import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { FeederCatalog } from "../application/feeder-catalog.js";
import type { Clock } from "../application/ports.js";
import { ErroDeDominio } from "../domain/shared/erro-de-dominio.js";

// D14: cada IP tem 5 tentativas erradas a cada 10 minutos. Com 1 milhão de códigos possíveis e cada um
// valendo 10 minutos, chutar fica inviável.
export const PAIRING_MAX_FAILURES = 5;
export const PAIRING_WINDOW_MS = 10 * 60_000;

export class AttemptLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly clock: Clock,
    private readonly max = PAIRING_MAX_FAILURES,
    private readonly windowMs = PAIRING_WINDOW_MS,
  ) {}

  blocked(key: string): boolean {
    return this.recent(key).length >= this.max;
  }

  fail(key: string): void {
    this.failures.set(key, [...this.recent(key), this.clock.now().getTime()]);
  }

  private recent(key: string): number[] {
    const since = this.clock.now().getTime() - this.windowMs;
    const list = (this.failures.get(key) ?? []).filter((t) => t > since);
    if (list.length === 0) this.failures.delete(key);
    else this.failures.set(key, list);
    return list;
  }
}

const pairSchema = z.object({ codigo: z.string().max(20) });

export type PairingOptions = {
  // A porta do broker que o aparelho usa depois de parear. O endereço é o mesmo que ele usou aqui.
  mqttPort: number;
};

// A rota que o ESP32 chama, sem sessão: ele ainda não é de ninguém até trocar o código.
export function registerPairingRoutes(
  catalog: FeederCatalog,
  clock: Clock,
  options: PairingOptions,
) {
  const limiter = new AttemptLimiter(clock);

  return async (app: FastifyInstance) => {
    app.post("/dispositivos/parear", async (request, reply) => {
      if (limiter.blocked(request.ip)) {
        return reply.code(429).send({ motivo: "muitas_tentativas" });
      }
      const { codigo } = pairSchema.parse(request.body);
      try {
        const credential = await catalog.pair(codigo.replace(/\D/g, ""));
        return {
          comedouro: credential.usuario,
          usuario: credential.usuario,
          senha: credential.senha,
          mqtt: { porta: options.mqttPort },
        };
      } catch (err) {
        if (err instanceof ErroDeDominio && err.codigo === "codigo_invalido") {
          limiter.fail(request.ip);
        }
        throw err;
      }
    });
  };
}
