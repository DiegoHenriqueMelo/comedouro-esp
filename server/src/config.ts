import { resolve } from "node:path";
import { z } from "zod";

// Toda a configuração do servidor vem de variáveis de ambiente (ou do arquivo `.env`). Ver docs/GUIA.md.

const emptyAsUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optional = z.preprocess(emptyAsUndefined, z.string().optional());
const optionalPort = z.preprocess(
  emptyAsUndefined,
  z.coerce.number().int().min(1).max(65535).optional(),
);

const schema = z.object({
  PORT: z.preprocess(emptyAsUndefined, z.coerce.number().int().default(3000)),
  HOST: z.preprocess(emptyAsUndefined, z.string().default("0.0.0.0")),
  FEEDER_ID: z.preprocess(emptyAsUndefined, z.string().default("principal")),

  MONGO_URL: optional,
  MONGO_DB: z.preprocess(emptyAsUndefined, z.string().default("comedouro")),

  MQTT_BROKER_PORT: optionalPort,
  MQTT_URL: optional,
  MQTT_USERNAME: optional,
  MQTT_PASSWORD: optional,

  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: optional,

  WEB_DIST: optional,
  SIM_CAT_EATS_MINUTES: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().min(0).default(10),
  ),
});

export type DeviceMode =
  | { kind: "simulado" }
  | { kind: "broker_embutido"; port: number }
  | { kind: "broker_externo"; url: string };

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = schema.parse(env);

  let device: DeviceMode = { kind: "simulado" };
  if (e.MQTT_BROKER_PORT !== undefined) {
    if (!e.MQTT_USERNAME || !e.MQTT_PASSWORD) {
      throw new Error(
        "MQTT_BROKER_PORT exige MQTT_USERNAME e MQTT_PASSWORD: o broker fica aberto na rede da casa.",
      );
    }
    device = { kind: "broker_embutido", port: e.MQTT_BROKER_PORT };
  } else if (e.MQTT_URL) {
    device = { kind: "broker_externo", url: e.MQTT_URL };
  }

  const vapid =
    e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY
      ? {
          publicKey: e.VAPID_PUBLIC_KEY,
          privateKey: e.VAPID_PRIVATE_KEY,
          subject: e.VAPID_SUBJECT ?? "mailto:comedouro@localhost",
        }
      : null;

  return {
    port: e.PORT,
    host: e.HOST,
    feederId: e.FEEDER_ID,
    mongo: e.MONGO_URL ? { url: e.MONGO_URL, db: e.MONGO_DB } : null,
    device,
    mqttUsername: e.MQTT_USERNAME,
    mqttPassword: e.MQTT_PASSWORD,
    vapid,
    webDist: resolve(e.WEB_DIST ?? "../web/dist"),
    simCatEatsMinutes: e.SIM_CAT_EATS_MINUTES,
  };
}
