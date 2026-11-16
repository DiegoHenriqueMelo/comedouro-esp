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

const optionalBoolean = z.preprocess(
  emptyAsUndefined,
  z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
);

const schema = z.object({
  PORT: z.preprocess(emptyAsUndefined, z.coerce.number().int().default(3000)),
  HOST: z.preprocess(emptyAsUndefined, z.string().default("0.0.0.0")),

  MONGO_URL: optional,
  MONGO_DB: z.preprocess(emptyAsUndefined, z.string().default("comedouro")),

  MQTT_BROKER_PORT: optionalPort,
  MQTT_USERNAME: optional,
  MQTT_PASSWORD: optional,

  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: optional,

  WEB_DIST: optional,

  NODE_ENV: optional,
  GOOGLE_CLIENT_ID: optional,
  // "true" ou "false". Sem valor: ligado fora de produção.
  DEV_LOGIN: optionalBoolean,
  // "true" ou "false". Sem valor: ligado só em produção (cookie só por HTTPS).
  COOKIE_SECURE: optionalBoolean,
  SIM_CAT_EATS_MINUTES: z.preprocess(
    emptyAsUndefined,
    z.coerce.number().min(0).default(10),
  ),
});

// O broker MQTT embutido: é por ele que os aparelhos (ESP32) conectam. Sem ele, só há comedouros simulados.
export type BrokerConfig = { port: number; username: string; password: string };

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = schema.parse(env);

  let broker: BrokerConfig | null = null;
  if (e.MQTT_BROKER_PORT !== undefined) {
    if (!e.MQTT_USERNAME || !e.MQTT_PASSWORD) {
      throw new Error(
        "MQTT_BROKER_PORT exige MQTT_USERNAME e MQTT_PASSWORD: é com eles que o próprio servidor entra no broker.",
      );
    }
    broker = {
      port: e.MQTT_BROKER_PORT,
      username: e.MQTT_USERNAME,
      password: e.MQTT_PASSWORD,
    };
  }

  const vapid =
    e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY
      ? {
          publicKey: e.VAPID_PUBLIC_KEY,
          privateKey: e.VAPID_PRIVATE_KEY,
          subject: e.VAPID_SUBJECT ?? "mailto:comedouro@localhost",
        }
      : null;

  const production = e.NODE_ENV === "production";

  return {
    port: e.PORT,
    host: e.HOST,
    mongo: e.MONGO_URL ? { url: e.MONGO_URL, db: e.MONGO_DB } : null,
    broker,
    vapid,
    webDist: resolve(e.WEB_DIST ?? "../web/dist"),
    simCatEatsMinutes: e.SIM_CAT_EATS_MINUTES,
    auth: {
      googleClientId: e.GOOGLE_CLIENT_ID ?? null,
      devLogin: e.DEV_LOGIN ?? !production,
      secureCookie: e.COOKIE_SECURE ?? production,
    },
  };
}
