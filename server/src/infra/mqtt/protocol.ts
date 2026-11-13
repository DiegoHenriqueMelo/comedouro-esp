import { z } from "zod";
import type {
  CommandResult,
  DeviceCommand,
  DeviceEvent,
  DeviceState,
} from "../../domain/device/device.js";
import { DEVICE_EVENT_TYPES } from "../../domain/device/device.js";

// O contrato entre o servidor e o ESP32 (docs/protocolo-mqtt.md). O firmware segue este arquivo.

export function topics(feederId: string) {
  const base = `alimentador/${feederId}`;
  return {
    config: `${base}/config`, // servidor → ESP32, QoS 1, retido
    sync: `${base}/sync`, // servidor → ESP32, QoS 1, retido
    command: `${base}/cmd`, // servidor → ESP32, QoS 1
    response: `${base}/cmd/resp`, // ESP32 → servidor, QoS 1
    event: `${base}/evento`, // ESP32 → servidor, QoS 1
    state: `${base}/estado`, // ESP32 → servidor, QoS 0, retido
    online: `${base}/online`, // ESP32 → servidor, QoS 1, retido, LWT
  };
}

const origin = z.enum(["agenda", "interface", "alexa"]);

const commandSchema = z.discriminatedUnion("tipo", [
  z.object({
    id: z.string(),
    tipo: z.literal("servir"),
    porcoes: z.number(),
    forcar: z.boolean(),
    origem: origin,
  }),
  z.object({ id: z.string(), tipo: z.literal("tara") }),
  z.object({
    id: z.string(),
    tipo: z.literal("calibrar_balanca"),
    gramas: z.number(),
  }),
  z.object({
    id: z.string(),
    tipo: z.literal("calibrar_dose"),
    porcoes: z.number(),
  }),
  z.object({
    id: z.string(),
    tipo: z.literal("testar_servo"),
    angulo: z.number(),
  }),
  z.object({ id: z.string(), tipo: z.literal("reconhecer_alerta") }),
]);

export function encodeCommand(id: string, command: DeviceCommand): string {
  switch (command.type) {
    case "servir":
      return JSON.stringify({
        id,
        tipo: "servir",
        porcoes: command.portions,
        forcar: command.force,
        origem: command.origin,
      });
    case "calibrar_balanca":
      return JSON.stringify({ id, tipo: command.type, gramas: command.grams });
    case "calibrar_dose":
      return JSON.stringify({
        id,
        tipo: command.type,
        porcoes: command.portions,
      });
    case "testar_servo":
      return JSON.stringify({ id, tipo: command.type, angulo: command.angle });
    case "tara":
    case "reconhecer_alerta":
      return JSON.stringify({ id, tipo: command.type });
  }
}

export function decodeCommand(text: string): {
  id: string;
  command: DeviceCommand;
} {
  const m = commandSchema.parse(JSON.parse(text));
  switch (m.tipo) {
    case "servir":
      return {
        id: m.id,
        command: {
          type: "servir",
          portions: m.porcoes,
          force: m.forcar,
          origin: m.origem,
        },
      };
    case "calibrar_balanca":
      return { id: m.id, command: { type: m.tipo, grams: m.gramas } };
    case "calibrar_dose":
      return { id: m.id, command: { type: m.tipo, portions: m.porcoes } };
    case "testar_servo":
      return { id: m.id, command: { type: m.tipo, angle: m.angulo } };
    case "tara":
    case "reconhecer_alerta":
      return { id: m.id, command: { type: m.tipo } };
  }
}

const responseSchema = z.object({
  id: z.string(),
  resultado: z.enum(["aceito", "recusado", "ocupado"]),
  motivo: z.enum(["limite_diario", "intervalo", "tigela_com_racao"]).optional(),
});

export function encodeResponse(id: string, result: CommandResult): string {
  return JSON.stringify({
    id,
    resultado: result.result,
    ...(result.result === "recusado" ? { motivo: result.reason } : {}),
  });
}

export function decodeResponse(text: string): {
  id: string;
  result: CommandResult;
} {
  const m = responseSchema.parse(JSON.parse(text));
  if (m.resultado === "recusado") {
    return {
      id: m.id,
      result: { result: "recusado", reason: m.motivo ?? "limite_diario" },
    };
  }
  return { id: m.id, result: { result: m.resultado } };
}

const eventSchema = z.object({
  seq: z.number().int().positive(),
  tipo: z.enum(DEVICE_EVENT_TYPES),
  hora: z.iso.datetime({ offset: true }),
  porcoes: z.number().optional(),
  gramas: z.number().optional(),
  origem: origin.optional(),
  motivo: z.string().optional(),
});

export function encodeEvent(event: DeviceEvent): string {
  return JSON.stringify({
    seq: event.seq,
    tipo: event.type,
    hora: event.at.toISOString(),
    porcoes: event.portions,
    gramas: event.grams,
    origem: event.origin,
    motivo: event.reason,
  });
}

export function decodeEvent(text: string): DeviceEvent {
  const m = eventSchema.parse(JSON.parse(text));
  return {
    seq: m.seq,
    type: m.tipo,
    at: new Date(m.hora),
    ...(m.porcoes === undefined ? {} : { portions: m.porcoes }),
    ...(m.gramas === undefined ? {} : { grams: m.gramas }),
    ...(m.origem === undefined ? {} : { origin: m.origem }),
    ...(m.motivo === undefined ? {} : { reason: m.motivo }),
  };
}

const stateSchema = z.object({
  hora: z.iso.datetime({ offset: true }),
  horaValida: z.boolean(),
  estado: z.enum(["ocioso", "servindo", "vazio"]),
  tigela: z.object({ gramas: z.number().nullable(), estavel: z.boolean() }),
  garrafa: z.object({
    percentual: z.number().nullable(),
    diasRestantes: z.number().nullable(),
  }),
  sensores: z.object({ balanca: z.boolean(), nivel: z.boolean() }),
  configVersao: z.number().int(),
  rssi: z.number().optional(),
});

export function encodeState(state: DeviceState): string {
  return JSON.stringify({
    hora: state.at.toISOString(),
    horaValida: state.timeValid,
    estado: state.state,
    tigela: { gramas: state.bowl.grams, estavel: state.bowl.stable },
    garrafa: {
      percentual: state.bottle.percent,
      diasRestantes: state.bottle.daysLeft,
    },
    sensores: { balanca: state.sensors.scale, nivel: state.sensors.level },
    configVersao: state.configVersion,
    rssi: state.rssi,
  });
}

export function decodeState(text: string): DeviceState {
  const m = stateSchema.parse(JSON.parse(text));
  return {
    at: new Date(m.hora),
    timeValid: m.horaValida,
    state: m.estado,
    bowl: { grams: m.tigela.gramas, stable: m.tigela.estavel },
    bottle: {
      percent: m.garrafa.percentual,
      daysLeft: m.garrafa.diasRestantes,
    },
    sensors: { scale: m.sensores.balanca, level: m.sensores.nivel },
    configVersion: m.configVersao,
    ...(m.rssi === undefined ? {} : { rssi: m.rssi }),
  };
}

export const syncSchema = z.object({ ultimoSeq: z.number().int().min(0) });
