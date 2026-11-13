import type {
  CommandResult,
  DeviceCommand,
  DeviceEvent,
  DeviceState,
  DeviceStatus,
} from "../domain/device/device.js";
import type { Feeder } from "../domain/feeder/feeder.js";
import type { ConfigPayload } from "./dto.js";

// As portas: interfaces que a aplicação define e a infraestrutura implementa.

export interface Clock {
  now(): Date;
}

export interface FeederRepository {
  load(): Promise<Feeder | null>;
  // `expectedVersion` é a versão que estava salva quando o alimentador foi carregado (null se é novo).
  // Se o banco tiver outra, lança ErroDeDominio("conflito_de_versao").
  save(feeder: Feeder, expectedVersion: number | null): Promise<void>;
}

export interface DeviceEventRepository {
  // Devolve false quando o `seq` já tinha sido registrado.
  add(event: DeviceEvent): Promise<boolean>;
  // Do mais recente para o mais antigo, pela hora do evento.
  list(limit: number): Promise<DeviceEvent[]>;
  lastSeq(): Promise<number>;
}

export interface DeviceStatusRepository {
  load(): Promise<DeviceStatus>;
  save(status: DeviceStatus): Promise<void>;
}

export type DeviceListeners = {
  event(event: DeviceEvent): Promise<void>;
  state(state: DeviceState): Promise<void>;
  online(online: boolean): Promise<void>;
};

// O ESP32, na língua do domínio. Adaptadores: simulado em memória e MQTT.
export interface Device {
  send(command: DeviceCommand): Promise<CommandResult>;
  publishConfiguration(payload: ConfigPayload): Promise<void>;
  // Diz ao dispositivo o último evento que o servidor já tem, para ele reenviar o resto.
  publishSync(lastSeq: number): Promise<void>;
  listen(listeners: DeviceListeners): void;
  close(): Promise<void>;
}

export const ALERT_TYPES = [
  "garrafa_baixa",
  "porcao_nao_saiu",
  "refeicao_pulada",
  "sensor_sem_leitura",
  "reiniciou",
  "offline",
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

export type Alert = {
  type: AlertType;
  message: string;
  openedAt: Date;
  notifiedAt: Date | null;
};

export interface AlertRepository {
  listOpen(): Promise<Alert[]>;
  // Devolve false quando já existe um alerta aberto desse tipo (R14).
  open(alert: Alert): Promise<boolean>;
  markNotified(type: AlertType, at: Date): Promise<void>;
  close(type: AlertType): Promise<void>;
}

export interface Notifier {
  notify(title: string, body: string): Promise<void>;
}

export type PushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export interface PushSubscriptionRepository {
  add(subscription: PushSubscription): Promise<void>;
  list(): Promise<PushSubscription[]>;
  remove(endpoint: string): Promise<void>;
}

// O "mundo físico" do dispositivo simulado. Só existe no modo demonstração.
export interface SimulatorControls {
  setBowlGrams(grams: number): void;
  setBottleGrams(grams: number): void;
  setSensors(sensors: { scale: boolean; level: boolean }): void;
  state(): DeviceState;
}
