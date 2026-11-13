import type { ConfigPayload } from "../../application/dto.js";
import type { Clock } from "../../application/ports.js";
import type {
  CommandResult,
  DeviceCommand,
  DeviceEvent,
  DeviceState,
  Origin,
} from "../../domain/device/device.js";
import { localParts } from "../../domain/shared/local-time.js";

export type SimulatedDeviceOptions = {
  clock: Clock;
  emitEvent: (event: DeviceEvent) => void;
  // Quanto tempo o "servo" leva por porção; nesse tempo, o dispositivo responde "ocupado".
  secondsPerPortion?: number;
  // O "gato" esvazia a tigela esse tanto de minutos depois de servir. null = ninguém come.
  catEatsAfterMinutes?: number | null;
  bottleCapacityGrams?: number;
};

const RETRY_MINUTES = 20;
const GIVE_UP_MINUTES = 120;

// Um ESP32 de mentira, com as mesmas regras que o firmware vai ter (plano, seções 3.2 e 3.3).
// Não é regra do servidor: é o dublê do dispositivo e a referência para o `lib/core` do firmware.
export class SimulatedDevice {
  private readonly clock: Clock;
  private readonly emitEvent: (event: DeviceEvent) => void;
  private readonly secondsPerPortion: number;
  private readonly catEatsAfterMinutes: number | null;
  private readonly capacity: number;

  private payload: ConfigPayload | null = null;
  private seq = 0;
  private bowlGrams = 0;
  private bottleGrams: number;
  private scaleOk = true;
  private levelOk = true;

  private day = "";
  private portionsToday = 0;
  private lastMealAt: Date | null = null;
  private busyUntil: Date | null = null;
  private empty = false; // estado VAZIO: a porção não saiu
  private eatAt: Date | null = null;
  private readonly done = new Set<string>();
  private readonly postponed = new Map<string, { first: Date; last: Date }>();

  constructor(options: SimulatedDeviceOptions) {
    this.clock = options.clock;
    this.emitEvent = options.emitEvent;
    this.secondsPerPortion = options.secondsPerPortion ?? 2;
    this.catEatsAfterMinutes = options.catEatsAfterMinutes ?? null;
    this.capacity = options.bottleCapacityGrams ?? 900;
    this.bottleGrams = this.capacity;
  }

  // Ao ligar: avisa que reiniciou. As refeições de hoje que já passaram não são servidas de novo.
  start(): void {
    this.rollDay();
    this.skipPastMeals();
    this.emit({ type: "reiniciou" });
  }

  // O servidor já tem eventos até esse número: os próximos continuam dali.
  fastForward(lastSeq: number): void {
    if (lastSeq > this.seq) this.seq = lastSeq;
  }

  applyConfiguration(payload: ConfigPayload): void {
    const first = this.payload === null;
    this.payload = payload;
    if (first) {
      this.rollDay();
      this.skipPastMeals();
    }
  }

  // Roda a agenda. O firmware chama isto a cada volta do loop.
  tick(): void {
    if (!this.payload) return;
    this.rollDay();
    const now = this.clock.now();

    if (this.eatAt && now >= this.eatAt) {
      this.bowlGrams = 0;
      this.eatAt = null;
    }
    if (this.empty || this.isBusy()) return;

    const { minutes } = localParts(now, this.payload.config.fusoHorario);
    for (const meal of this.payload.agenda) {
      if (!meal.ativo) continue;
      const key = `${this.day}|${meal.hora}`;
      if (this.done.has(key)) continue;

      const late = minutes - toMinutes(meal.hora);
      if (late < 0) continue;

      const waiting = this.postponed.get(key);
      if (waiting) {
        if (minutesBetween(waiting.first, now) >= GIVE_UP_MINUTES) {
          this.emit({ type: "refeicao_pulada", portions: meal.porcoes });
          this.finish(key);
          continue;
        }
        if (minutesBetween(waiting.last, now) < RETRY_MINUTES) continue;
      } else if (late > GIVE_UP_MINUTES) {
        // Passou da janela de 2 h sem nem tentar (dispositivo desligado): não serve mais.
        this.finish(key);
        continue;
      }

      const result = this.tryServe(meal.porcoes, false, "agenda");
      if (result.result === "aceito") {
        this.finish(key);
      } else if (result.result === "recusado") {
        if (result.reason === "tigela_com_racao") {
          if (waiting) {
            waiting.last = now;
          } else {
            this.postponed.set(key, { first: now, last: now });
            this.emit({
              type: "refeicao_adiada",
              portions: meal.porcoes,
              origin: "agenda",
              reason: result.reason,
            });
          }
        } else {
          this.emit({
            type: "refeicao_recusada",
            portions: meal.porcoes,
            origin: "agenda",
            reason: result.reason,
          });
          this.finish(key);
        }
      }
      return; // uma refeição por volta
    }
  }

  handle(command: DeviceCommand): CommandResult {
    switch (command.type) {
      case "servir": {
        const result = this.tryServe(
          command.portions,
          command.force,
          command.origin,
        );
        if (result.result === "recusado") {
          this.emit({
            type: "refeicao_recusada",
            portions: command.portions,
            origin: command.origin,
            reason: result.reason,
          });
        }
        return result;
      }
      case "reconhecer_alerta":
        // Na simulação, reconhecer o alerta também "reabastece" a garrafa.
        if (this.empty) this.bottleGrams = this.capacity;
        this.empty = false;
        return { result: "aceito" };
      case "tara":
        if (this.isBusy()) return { result: "ocupado" };
        this.bowlGrams = 0;
        return { result: "aceito" };
      case "calibrar_dose": {
        if (this.isBusy() || this.empty) return { result: "ocupado" };
        // Solta as porções para pesar; não conta no limite diário.
        this.dispense(command.portions);
        return { result: "aceito" };
      }
      case "calibrar_balanca":
      case "testar_servo":
        if (this.isBusy()) return { result: "ocupado" };
        return { result: "aceito" };
    }
  }

  state(): DeviceState {
    const dailyGrams = this.payload
      ? this.payload.agenda
          .filter((m) => m.ativo)
          .reduce((sum, m) => sum + m.porcoes, 0) *
        this.payload.config.gramasPorPorcao
      : 0;

    return {
      at: this.clock.now(),
      timeValid: true,
      state: this.empty ? "vazio" : this.isBusy() ? "servindo" : "ocioso",
      bowl: {
        grams: this.scaleOk ? Math.round(this.bowlGrams * 10) / 10 : null,
        stable: true,
      },
      bottle: {
        percent: this.levelOk
          ? Math.round((this.bottleGrams / this.capacity) * 100)
          : null,
        daysLeft:
          this.levelOk && dailyGrams > 0
            ? Math.floor(this.bottleGrams / dailyGrams)
            : null,
      },
      sensors: { scale: this.scaleOk, level: this.levelOk },
      configVersion: this.payload?.versao ?? 0,
      rssi: -55,
    };
  }

  // Para os testes e para a simulação: mexer no "mundo físico".
  setBowlGrams(grams: number): void {
    this.bowlGrams = grams;
  }

  setBottleGrams(grams: number): void {
    this.bottleGrams = grams;
  }

  setSensors(sensors: { scale: boolean; level: boolean }): void {
    if (this.scaleOk && !sensors.scale) {
      this.emit({ type: "sensor_sem_leitura", reason: "balanca" });
    }
    if (this.levelOk && !sensors.level) {
      this.emit({ type: "sensor_sem_leitura", reason: "nivel" });
    }
    this.scaleOk = sensors.scale;
    this.levelOk = sensors.level;
  }

  // A única porta de entrada de uma porção (plano 3.2: `requestDispense`).
  private tryServe(
    portions: number,
    force: boolean,
    origin: Origin,
  ): CommandResult {
    if (!this.payload || this.empty || this.isBusy()) {
      return { result: "ocupado" };
    }
    this.rollDay();
    const { config } = this.payload;
    const now = this.clock.now();

    if (this.portionsToday + portions > config.limiteDiarioPorcoes) {
      return { result: "recusado", reason: "limite_diario" };
    }
    if (
      this.lastMealAt &&
      minutesBetween(this.lastMealAt, now) < config.intervaloMinimoMin
    ) {
      return { result: "recusado", reason: "intervalo" };
    }
    // O `force` só ignora a tigela, nunca os limites. Sem balança, vale só o limite e o intervalo.
    if (this.scaleOk && this.bowlGrams > config.limiteTigelaGramas && !force) {
      return { result: "recusado", reason: "tigela_com_racao" };
    }

    if (this.bottleGrams <= 0) {
      // O servo girou, mas o peso não subiu: entra em VAZIO e avisa.
      this.empty = true;
      this.emit({ type: "garrafa_vazia", portions, origin });
      return { result: "aceito" };
    }

    const grams = this.dispense(portions);
    this.portionsToday += portions;
    this.lastMealAt = now;
    this.emit({ type: "refeicao_servida", portions, grams, origin });
    return { result: "aceito" };
  }

  private dispense(portions: number): number {
    const gramsPerPortion = this.payload?.config.gramasPorPorcao ?? 6;
    const grams = Math.min(portions * gramsPerPortion, this.bottleGrams);
    const now = this.clock.now();

    this.bottleGrams -= grams;
    this.bowlGrams += grams;
    this.busyUntil = new Date(
      now.getTime() + portions * this.secondsPerPortion * 1000,
    );
    if (this.catEatsAfterMinutes !== null) {
      this.eatAt = new Date(now.getTime() + this.catEatsAfterMinutes * 60_000);
    }
    return Math.round(grams * 10) / 10;
  }

  private isBusy(): boolean {
    return this.busyUntil !== null && this.clock.now() < this.busyUntil;
  }

  // A virada da meia-noite zera o contador do dia.
  private rollDay(): void {
    if (!this.payload) return;
    const { day } = localParts(
      this.clock.now(),
      this.payload.config.fusoHorario,
    );
    if (day !== this.day) {
      this.day = day;
      this.portionsToday = 0;
      this.done.clear();
      this.postponed.clear();
    }
  }

  private skipPastMeals(): void {
    if (!this.payload) return;
    const { minutes } = localParts(
      this.clock.now(),
      this.payload.config.fusoHorario,
    );
    for (const meal of this.payload.agenda) {
      if (toMinutes(meal.hora) < minutes) {
        this.done.add(`${this.day}|${meal.hora}`);
      }
    }
  }

  private finish(key: string): void {
    this.done.add(key);
    this.postponed.delete(key);
  }

  private emit(event: Omit<DeviceEvent, "seq" | "at">): void {
    this.seq += 1;
    this.emitEvent({ ...event, seq: this.seq, at: this.clock.now() });
  }
}

function toMinutes(hora: string): number {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m);
}

function minutesBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 60_000;
}
