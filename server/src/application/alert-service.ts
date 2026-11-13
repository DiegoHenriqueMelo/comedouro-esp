import type { DeviceEvent, DeviceState } from "../domain/device/device.js";
import type {
  Alert,
  AlertRepository,
  AlertType,
  Clock,
  Notifier,
} from "./ports.js";

type Log = { warn(obj: unknown, msg: string): void };

export const OFFLINE_ALERT_MINUTES = 30;
export const LOW_BOTTLE_PERCENT = 20;

const TITLES: Record<AlertType, string> = {
  garrafa_baixa: "Ração acabando",
  porcao_nao_saiu: "A porção não saiu",
  refeicao_pulada: "Refeição pulada",
  sensor_sem_leitura: "Sensor sem leitura",
  reiniciou: "O alimentador reiniciou",
  offline: "Alimentador offline",
};

// Transforma o que o dispositivo informa em alertas: um aberto por tipo (R14), avisado uma vez só (R13).
export class AlertService {
  constructor(
    private readonly alerts: AlertRepository,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
    private readonly log: Log = { warn: () => {} },
  ) {}

  list(): Promise<Alert[]> {
    return this.alerts.listOpen();
  }

  async onEvent(event: DeviceEvent): Promise<void> {
    if (event.type === "garrafa_vazia") {
      await this.open(
        "porcao_nao_saiu",
        "A balança não viu a ração cair: a garrafa esvaziou ou a comporta travou.",
      );
    } else if (event.type === "refeicao_pulada") {
      await this.open(
        "refeicao_pulada",
        "Uma refeição agendada foi pulada porque a tigela ficou com ração por 2 h.",
      );
    } else if (event.type === "sensor_sem_leitura") {
      await this.open(
        "sensor_sem_leitura",
        "Um sensor parou de responder. A agenda continua só com os limites.",
      );
    } else if (event.type === "reiniciou") {
      await this.open(
        "reiniciou",
        "O alimentador reiniciou (queda de luz?). Confira se está tudo certo.",
      );
    }
  }

  async onState(state: DeviceState): Promise<void> {
    const percent = state.bottle.percent;
    if (percent !== null && percent < LOW_BOTTLE_PERCENT) {
      const days = state.bottle.daysLeft;
      const prazo =
        days === null
          ? ""
          : ` Dá para cerca de ${days} ${days === 1 ? "dia" : "dias"}.`;
      await this.open(
        "garrafa_baixa",
        `A garrafa está com ${Math.round(percent)}%.${prazo}`,
      );
    } else if (percent !== null) {
      await this.alerts.close("garrafa_baixa");
    }

    if (state.sensors.scale && state.sensors.level) {
      await this.alerts.close("sensor_sem_leitura");
    } else {
      const qual = state.sensors.scale ? "sensor de nível" : "balança";
      await this.open(
        "sensor_sem_leitura",
        `Sem leitura: ${qual}. A agenda continua só com os limites.`,
      );
    }

    if (state.state !== "vazio") await this.alerts.close("porcao_nao_saiu");
  }

  async onOnline(online: boolean): Promise<void> {
    if (online) await this.alerts.close("offline");
  }

  // Chamado de tempos em tempos: avisa quando o dispositivo some por mais de 30 min.
  async checkOffline(online: boolean, changedAt: Date | null): Promise<void> {
    if (online || changedAt === null) return;

    const minutes = (this.clock.now().getTime() - changedAt.getTime()) / 60_000;
    if (minutes >= OFFLINE_ALERT_MINUTES) {
      await this.open(
        "offline",
        `Sem contato com o alimentador há mais de ${OFFLINE_ALERT_MINUTES} min. Ele continua servindo pela agenda, se estiver ligado.`,
      );
    }
  }

  // "Entendi": fecha os alertas que não se resolvem sozinhos.
  async acknowledge(): Promise<void> {
    for (const type of [
      "refeicao_pulada",
      "reiniciou",
      "porcao_nao_saiu",
    ] as const) {
      await this.alerts.close(type);
    }
  }

  private async open(type: AlertType, message: string): Promise<void> {
    const now = this.clock.now();
    const isNew = await this.alerts.open({
      type,
      message,
      openedAt: now,
      notifiedAt: null,
    });
    if (!isNew) return;

    try {
      await this.notifier.notify(TITLES[type], message);
      await this.alerts.markNotified(type, now);
    } catch (err) {
      this.log.warn({ err }, "não foi possível enviar a notificação");
    }
  }
}
