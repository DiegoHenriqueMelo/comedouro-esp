// O que o servidor sabe sobre o ESP32 (glossário: Dispositivo, Comando, Estado e Evento do dispositivo).
// Quem decide cada porção é o ESP32; aqui só ficam os formatos do que vai e do que volta.

export type Origin = "agenda" | "interface" | "alexa";

export type RefusalReason = "limite_diario" | "intervalo" | "tigela_com_racao";

export type DeviceCommand =
  | { type: "servir"; portions: number; force: boolean; origin: Origin }
  | { type: "tara" }
  | { type: "calibrar_balanca"; grams: number }
  | { type: "calibrar_dose"; portions: number }
  | { type: "testar_servo"; angle: number }
  | { type: "reconhecer_alerta" };

export type CommandResult =
  | { result: "aceito" }
  | { result: "recusado"; reason: RefusalReason }
  | { result: "ocupado" }
  | { result: "offline" };

export const DEVICE_EVENT_TYPES = [
  "refeicao_servida",
  "refeicao_recusada",
  "refeicao_adiada",
  "refeicao_pulada",
  "garrafa_vazia",
  "sensor_sem_leitura",
  "reiniciou",
] as const;

export type DeviceEventType = (typeof DEVICE_EVENT_TYPES)[number];

export type DeviceEvent = {
  seq: number;
  type: DeviceEventType;
  at: Date;
  portions?: number;
  grams?: number;
  origin?: Origin;
  reason?: string;
};

export type DeviceState = {
  at: Date;
  timeValid: boolean;
  state: "ocioso" | "servindo" | "vazio";
  bowl: { grams: number | null; stable: boolean };
  bottle: { percent: number | null; daysLeft: number | null };
  sensors: { scale: boolean; level: boolean };
  configVersion: number;
  rssi?: number;
};

export type DeviceStatus = {
  online: boolean;
  onlineChangedAt: Date | null;
  state: DeviceState | null;
};
