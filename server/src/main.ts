import { MongoClient } from "mongodb";
import { pino } from "pino";
import { buildApp } from "./app.js";
import type {
  AlertRepository,
  Device,
  DeviceEventRepository,
  DeviceStatusRepository,
  FeederRepository,
  Notifier,
  PushSubscriptionRepository,
  SessionRepository,
  UserRepository,
} from "./application/ports.js";
import { buildSystem } from "./composition.js";
import { loadConfig } from "./config.js";
import { loadEnvFiles } from "./env.js";
import { GoogleIdentityVerifier } from "./infra/google/google-identity-verifier.js";
import {
  MemoryAlertRepository,
  MemoryDeviceEventRepository,
  MemoryDeviceStatusRepository,
  MemoryFeederRepository,
  MemoryPushSubscriptionRepository,
  MemorySessionRepository,
  MemoryUserRepository,
  systemClock,
} from "./infra/memory/memory-repositories.js";
import {
  MongoAlertRepository,
  MongoDeviceEventRepository,
  MongoDeviceStatusRepository,
  MongoFeederRepository,
  MongoPushSubscriptionRepository,
  MongoSessionRepository,
  MongoUserRepository,
} from "./infra/mongo/mongo-repositories.js";
import {
  type EmbeddedBroker,
  startEmbeddedBroker,
} from "./infra/mqtt/embedded-broker.js";
import { MqttDevice } from "./infra/mqtt/mqtt-device.js";
import {
  LogNotifier,
  WebPushNotifier,
} from "./infra/push/web-push-notifier.js";
import { InProcessDevice } from "./infra/simulated/in-process-device.js";

// A raiz de composição: lê a configuração, cria os adaptadores de verdade e sobe o servidor.

loadEnvFiles();

const config = loadConfig();
const log = pino({ level: process.env.LOG_LEVEL ?? "info" });
const clock = systemClock;

// 1. Banco: MongoDB quando há MONGO_URL; memória quando não há (os dados somem ao reiniciar).
let mongo: MongoClient | null = null;
let feederRepository: FeederRepository;
let eventRepository: DeviceEventRepository;
let statusRepository: DeviceStatusRepository;
let alertRepository: AlertRepository;
let subscriptions: PushSubscriptionRepository;
let users: UserRepository;
let sessions: SessionRepository;

if (config.mongo) {
  mongo = new MongoClient(config.mongo.url, { serverSelectionTimeoutMS: 8000 });
  await mongo.connect();
  const db = mongo.db(config.mongo.db);
  const events = new MongoDeviceEventRepository(db, config.feederId);
  await events.ensureIndexes();

  feederRepository = new MongoFeederRepository(db, config.feederId);
  eventRepository = events;
  statusRepository = new MongoDeviceStatusRepository(db, config.feederId);
  alertRepository = new MongoAlertRepository(db, config.feederId);
  subscriptions = new MongoPushSubscriptionRepository(db);
  const mongoUsers = new MongoUserRepository(db);
  await mongoUsers.ensureIndexes();
  const mongoSessions = new MongoSessionRepository(db);
  await mongoSessions.ensureIndexes();
  users = mongoUsers;
  sessions = mongoSessions;
  log.info({ db: config.mongo.db }, "banco: MongoDB");
} else {
  feederRepository = new MemoryFeederRepository();
  eventRepository = new MemoryDeviceEventRepository();
  statusRepository = new MemoryDeviceStatusRepository();
  alertRepository = new MemoryAlertRepository();
  subscriptions = new MemoryPushSubscriptionRepository();
  users = new MemoryUserRepository();
  sessions = new MemorySessionRepository();
  log.warn("banco: memória (sem MONGO_URL). Os dados somem ao reiniciar.");
}

// 2. Dispositivo: simulado dentro do servidor, ou o ESP32 por MQTT.
let broker: EmbeddedBroker | null = null;
let simulated: InProcessDevice | null = null;
let device: Device;

if (config.device.kind === "simulado") {
  simulated = new InProcessDevice(
    clock,
    {
      catEatsAfterMinutes:
        config.simCatEatsMinutes > 0 ? config.simCatEatsMinutes : null,
    },
    log,
  );
  device = simulated;
  log.warn("dispositivo: simulado (sem MQTT). Nenhum ESP32 é controlado.");
} else {
  let url: string;
  if (config.device.kind === "broker_embutido") {
    broker = await startEmbeddedBroker({
      port: config.device.port,
      ...(config.mqttUsername ? { username: config.mqttUsername } : {}),
      ...(config.mqttPassword ? { password: config.mqttPassword } : {}),
    });
    url = `mqtt://127.0.0.1:${broker.port}`;
    log.info({ port: broker.port }, "broker MQTT embutido no ar");
  } else {
    url = config.device.url;
  }
  device = new MqttDevice({
    url,
    feederId: config.feederId,
    log,
    ...(config.mqttUsername ? { username: config.mqttUsername } : {}),
    ...(config.mqttPassword ? { password: config.mqttPassword } : {}),
  });
}

// 3. Avisos: push quando há chaves VAPID; só o log quando não há.
const notifier: Notifier = config.vapid
  ? new WebPushNotifier(subscriptions, config.vapid, log)
  : new LogNotifier(log);
if (!config.vapid) log.warn("push: desligado (sem chaves VAPID).");

// 4. Login: Google quando há GOOGLE_CLIENT_ID.
const identityVerifier = config.auth.googleClientId
  ? new GoogleIdentityVerifier(config.auth.googleClientId)
  : null;
if (!identityVerifier)
  log.warn("login: sem GOOGLE_CLIENT_ID, o botão do Google não aparece.");
if (config.auth.devLogin)
  log.warn('login: "Entrar como dev" ligado (sem Google).');

// 5. Casos de uso e HTTP.
const system = buildSystem({
  feederRepository,
  eventRepository,
  statusRepository,
  alertRepository,
  device,
  notifier,
  clock,
  users,
  sessions,
  identityVerifier,
  log,
});

const app = buildApp({
  loggerInstance: log,
  system,
  push: {
    publicKey: config.vapid?.publicKey ?? null,
    subscriptions,
    notifier,
  },
  auth: config.auth,
  webDist: config.webDist,
  simulator: simulated?.simulated ?? null,
});

// Deixa o último evento conhecido e a configuração esperando o dispositivo (no broker, ou no simulado).
// O `sync` vai primeiro: os eventos novos continuam a numeração do que já está salvo.
await device.publishSync(await eventRepository.lastSeq());
system.devices.start();
await system.feeders.republish();
simulated?.startTicking();

const offlineCheck = setInterval(() => {
  system.devices
    .checkOffline()
    .catch((err) => log.error({ err }, "erro ao conferir o dispositivo"));
}, 60_000);

await app.listen({ port: config.port, host: config.host });

async function shutdown(signal: string) {
  log.info({ signal }, "encerrando");
  clearInterval(offlineCheck);
  await app.close();
  await device.close();
  await broker?.close();
  await mongo?.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
