import type {
  CommandResult,
  DeviceCommand,
  DeviceEvent,
  DeviceState,
} from "../domain/device/device.js";
import { Portion } from "../domain/feeder/portion.js";
import { localParts } from "../domain/shared/local-time.js";
import type { AlertService } from "./alert-service.js";
import { toConfigDto, toScheduleDto } from "./dto.js";
import type { FeederService } from "./feeder-service.js";
import type {
  Clock,
  Device,
  DeviceEventRepository,
  DeviceStatusRepository,
} from "./ports.js";

export const HISTORY_MAX = 200;

// Casos de uso do dispositivo: mandar comandos, registrar o que ele informa e montar o status.
export class DeviceService {
  constructor(
    private readonly device: Device,
    private readonly events: DeviceEventRepository,
    private readonly status: DeviceStatusRepository,
    private readonly feeders: FeederService,
    private readonly alerts: AlertService,
    private readonly clock: Clock,
  ) {}

  // Liga o que chega do dispositivo aos casos de uso.
  start(): void {
    this.device.listen({
      event: (event) => this.registerEvent(event),
      state: (state) => this.registerState(state),
      online: (online) => this.registerOnline(online),
    });
  }

  feedNow(portions: number, force: boolean): Promise<CommandResult> {
    const valid = Portion.create(portions);
    return this.device.send({
      type: "servir",
      portions: valid.value,
      force,
      origin: "interface",
    });
  }

  async command(command: DeviceCommand): Promise<CommandResult> {
    const result = await this.device.send(command);
    if (command.type === "reconhecer_alerta" && result.result !== "offline") {
      await this.alerts.acknowledge();
    }
    return result;
  }

  // "Entendi" no PWA: fecha os alertas e, se o dispositivo estiver em VAZIO, tira ele de lá.
  async acknowledgeAlerts(): Promise<void> {
    await this.alerts.acknowledge();
    await this.device.send({ type: "reconhecer_alerta" });
  }

  // O dispositivo pode reenviar eventos: o mesmo `seq` duas vezes vale uma vez.
  async registerEvent(event: DeviceEvent): Promise<void> {
    const isNew = await this.events.add(event);
    if (isNew) await this.alerts.onEvent(event);
  }

  async registerState(state: DeviceState): Promise<void> {
    const current = await this.status.load();
    await this.status.save({ ...current, state });
    await this.alerts.onState(state);
  }

  async registerOnline(online: boolean): Promise<void> {
    const current = await this.status.load();
    if (current.online !== online || current.onlineChangedAt === null) {
      await this.status.save({
        ...current,
        online,
        onlineChangedAt: this.clock.now(),
      });
    }
    await this.alerts.onOnline(online);

    if (online) {
      // O dispositivo voltou: manda a configuração e pede os eventos que faltam.
      await this.feeders.republish();
      await this.device.publishSync(await this.events.lastSeq());
    }
  }

  async checkOffline(): Promise<void> {
    const { online, onlineChangedAt } = await this.status.load();
    await this.alerts.checkOffline(online, onlineChangedAt);
  }

  async history(limit: number) {
    const events = await this.events.list(limit);
    return events.map((e) => ({
      seq: e.seq,
      tipo: e.type,
      hora: e.at.toISOString(),
      porcoes: e.portions ?? null,
      gramas: e.grams ?? null,
      origem: e.origin ?? null,
      motivo: e.reason ?? null,
    }));
  }

  async getStatus() {
    const feeder = await this.feeders.get();
    const { online, onlineChangedAt, state } = await this.status.load();
    const now = this.clock.now();
    const timeZone = feeder.configuration.timeZone;

    // O "hoje" usa o fuso da configuração, não o do servidor.
    const today = localParts(now, timeZone).day;
    const served = (await this.events.list(500)).filter(
      (e) => e.type === "refeicao_servida",
    );
    const servedToday = served.filter(
      (e) => localParts(e.at, timeZone).day === today,
    );
    const last = served[0];

    const config = toConfigDto(feeder.configuration);
    const appliedVersion = state?.configVersion ?? null;

    // A próxima refeição ativa: a primeira depois de agora ou, se hoje acabou, a primeira de amanhã.
    const nowMinutes = localParts(now, timeZone).minutes;
    const actives = toScheduleDto(feeder.schedule).filter((m) => m.ativo);
    const next =
      actives.find((m) => toMinutes(m.hora) > nowMinutes) ?? actives[0] ?? null;

    return {
      hora: now.toISOString(),
      online,
      onlineDesde: onlineChangedAt?.toISOString() ?? null,
      estado: state?.state ?? null,
      horaValida: state?.timeValid ?? null,
      proximaRefeicao: next
        ? {
            hora: next.hora,
            porcoes: next.porcoes,
            amanha: toMinutes(next.hora) <= nowMinutes,
          }
        : null,
      ultimaRefeicao: last
        ? {
            hora: last.at.toISOString(),
            porcoes: last.portions ?? null,
            gramas: last.grams ?? null,
            origem: last.origin ?? null,
          }
        : null,
      hoje: {
        porcoes: servedToday.reduce((sum, e) => sum + (e.portions ?? 0), 0),
        gramas:
          Math.round(
            servedToday.reduce((sum, e) => sum + (e.grams ?? 0), 0) * 10,
          ) / 10,
      },
      limites: {
        limiteDiarioPorcoes: config.limiteDiarioPorcoes,
        intervaloMinimoMin: config.intervaloMinimoMin,
        limiteTigelaGramas: config.limiteTigelaGramas,
      },
      tigela: state
        ? { gramas: state.bowl.grams, estavel: state.bowl.stable }
        : null,
      garrafa: state
        ? {
            percentual: state.bottle.percent,
            diasRestantes: state.bottle.daysLeft,
          }
        : null,
      sensores: state
        ? { balanca: state.sensors.scale, nivel: state.sensors.level }
        : null,
      wifi: state?.rssi === undefined ? null : { rssi: state.rssi },
      config: {
        versao: feeder.version,
        versaoAplicada: appliedVersion,
        sincronizado: appliedVersion === feeder.version,
      },
      alertas: (await this.alerts.list()).map((a) => ({
        tipo: a.type,
        mensagem: a.message,
        desde: a.openedAt.toISOString(),
      })),
    };
  }
}

function toMinutes(hora: string): number {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m);
}
