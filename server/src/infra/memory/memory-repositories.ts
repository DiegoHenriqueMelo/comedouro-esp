import {
  type ConfigDto,
  fromConfigDto,
  fromScheduleDto,
  type ScheduleItemDto,
  toConfigDto,
  toScheduleDto,
} from "../../application/dto.js";
import type {
  Alert,
  AlertRepository,
  AlertType,
  DeviceEventRepository,
  DeviceStatusRepository,
  FeederRepository,
  Notifier,
  PushSubscription,
  PushSubscriptionRepository,
} from "../../application/ports.js";
import type { DeviceEvent, DeviceStatus } from "../../domain/device/device.js";
import { Feeder } from "../../domain/feeder/feeder.js";
import { ErroDeDominio } from "../../domain/shared/erro-de-dominio.js";

// Adaptadores em memória: para os testes e para rodar sem banco (os dados somem ao reiniciar).

type FeederSnapshot = {
  version: number;
  config: ConfigDto;
  schedule: ScheduleItemDto[];
};

export class MemoryFeederRepository implements FeederRepository {
  // Guarda uma cópia, nunca a referência do objeto: mexer no Feeder depois de salvar não muda o que está salvo.
  private saved: FeederSnapshot | null = null;

  async load(): Promise<Feeder | null> {
    if (!this.saved) return null;
    return Feeder.restore(
      fromScheduleDto(this.saved.schedule),
      fromConfigDto(this.saved.config),
      this.saved.version,
    );
  }

  async save(feeder: Feeder, expectedVersion: number | null): Promise<void> {
    const current = this.saved?.version ?? null;
    if (current !== expectedVersion) {
      throw new ErroDeDominio(
        "conflito_de_versao",
        `a versão salva é ${current}, e a esperada era ${expectedVersion}`,
      );
    }
    this.saved = {
      version: feeder.version,
      config: toConfigDto(feeder.configuration),
      schedule: toScheduleDto(feeder.schedule),
    };
  }
}

export class MemoryDeviceEventRepository implements DeviceEventRepository {
  private readonly bySeq = new Map<number, DeviceEvent>();

  async add(event: DeviceEvent): Promise<boolean> {
    if (this.bySeq.has(event.seq)) return false;
    this.bySeq.set(event.seq, { ...event });
    return true;
  }

  async list(limit: number): Promise<DeviceEvent[]> {
    return [...this.bySeq.values()]
      .sort((a, b) => b.at.getTime() - a.at.getTime() || b.seq - a.seq)
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  async lastSeq(): Promise<number> {
    return Math.max(0, ...this.bySeq.keys());
  }
}

export class MemoryDeviceStatusRepository implements DeviceStatusRepository {
  private status: DeviceStatus = {
    online: false,
    onlineChangedAt: null,
    state: null,
  };

  async load(): Promise<DeviceStatus> {
    return { ...this.status };
  }

  async save(status: DeviceStatus): Promise<void> {
    this.status = { ...status };
  }
}

export class MemoryAlertRepository implements AlertRepository {
  private readonly openAlerts = new Map<AlertType, Alert>();

  async listOpen(): Promise<Alert[]> {
    return [...this.openAlerts.values()].map((a) => ({ ...a }));
  }

  async open(alert: Alert): Promise<boolean> {
    if (this.openAlerts.has(alert.type)) return false;
    this.openAlerts.set(alert.type, { ...alert });
    return true;
  }

  async markNotified(type: AlertType, at: Date): Promise<void> {
    const alert = this.openAlerts.get(type);
    if (alert) alert.notifiedAt = at;
  }

  async close(type: AlertType): Promise<void> {
    this.openAlerts.delete(type);
  }
}

export class MemoryPushSubscriptionRepository
  implements PushSubscriptionRepository
{
  private readonly byEndpoint = new Map<string, PushSubscription>();

  async add(subscription: PushSubscription): Promise<void> {
    this.byEndpoint.set(subscription.endpoint, subscription);
  }

  async list(): Promise<PushSubscription[]> {
    return [...this.byEndpoint.values()];
  }

  async remove(endpoint: string): Promise<void> {
    this.byEndpoint.delete(endpoint);
  }
}

// Guarda as notificações numa lista: para os testes, e para quando o push não está configurado.
export class MemoryNotifier implements Notifier {
  readonly sent: { title: string; body: string }[] = [];

  async notify(title: string, body: string): Promise<void> {
    this.sent.push({ title, body });
  }
}

export class FixedClock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }

  set(date: Date): void {
    this.current = date;
  }
}

export const systemClock = { now: () => new Date() };
