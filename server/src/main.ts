import { MongoClient } from "mongodb";
import { pino } from "pino";
import { buildApp } from "./app.js";
import { DeviceAccess } from "./application/device-access.js";
import type {
  DeviceCredentialRepository,
  FeederProfileRepository,
  FeederStorage,
  PetPhotoRepository,
  PetRepository,
  PushSubscriptionRepository,
  SessionRepository,
  UserNotifier,
  UserRepository,
} from "./application/ports.js";
import { buildSystem } from "./composition.js";
import { loadConfig } from "./config.js";
import { loadEnvFiles } from "./env.js";
import {
  type MqttOptions,
  ServerDeviceFactory,
} from "./infra/device-factory.js";
import { GoogleIdentityVerifier } from "./infra/google/google-identity-verifier.js";
import {
  MemoryDeviceCredentialRepository,
  MemoryFeederProfileRepository,
  MemoryFeederStorage,
  MemoryPetPhotoRepository,
  MemoryPetRepository,
  MemoryPushSubscriptionRepository,
  MemorySessionRepository,
  MemoryUserRepository,
  systemClock,
} from "./infra/memory/memory-repositories.js";
import {
  MongoDeviceCredentialRepository,
  MongoFeederProfileRepository,
  MongoFeederStorage,
  MongoPetPhotoRepository,
  MongoPetRepository,
  MongoPushSubscriptionRepository,
  MongoSessionRepository,
  MongoUserRepository,
} from "./infra/mongo/mongo-repositories.js";
import {
  type EmbeddedBroker,
  startEmbeddedBroker,
} from "./infra/mqtt/embedded-broker.js";
import {
  LogNotifier,
  WebPushNotifier,
} from "./infra/push/web-push-notifier.js";

// A raiz de composição: lê a configuração, cria os adaptadores de verdade e sobe o servidor.

loadEnvFiles();

const config = loadConfig();
const log = pino({ level: process.env.LOG_LEVEL ?? "info" });
const clock = systemClock;

// 1. Banco: MongoDB quando há MONGO_URL; memória quando não há (os dados somem ao reiniciar).
let mongo: MongoClient | null = null;
let storage: FeederStorage;
let profiles: FeederProfileRepository;
let credentials: DeviceCredentialRepository;
let subscriptions: PushSubscriptionRepository;
let users: UserRepository;
let sessions: SessionRepository;
let pets: PetRepository;
let petPhotos: PetPhotoRepository;

if (config.mongo) {
  mongo = new MongoClient(config.mongo.url, { serverSelectionTimeoutMS: 8000 });
  await mongo.connect();
  const db = mongo.db(config.mongo.db);

  const mongoStorage = new MongoFeederStorage(db);
  const mongoProfiles = new MongoFeederProfileRepository(db);
  const mongoCredentials = new MongoDeviceCredentialRepository(db);
  const mongoSubscriptions = new MongoPushSubscriptionRepository(db);
  const mongoUsers = new MongoUserRepository(db);
  const mongoSessions = new MongoSessionRepository(db);
  const mongoPets = new MongoPetRepository(db);
  for (const repository of [
    mongoStorage,
    mongoProfiles,
    mongoCredentials,
    mongoSubscriptions,
    mongoUsers,
    mongoSessions,
    mongoPets,
  ]) {
    await repository.ensureIndexes();
  }

  storage = mongoStorage;
  profiles = mongoProfiles;
  credentials = mongoCredentials;
  subscriptions = mongoSubscriptions;
  users = mongoUsers;
  sessions = mongoSessions;
  pets = mongoPets;
  petPhotos = new MongoPetPhotoRepository(db);
  log.info({ db: config.mongo.db }, "banco: MongoDB");
} else {
  storage = new MemoryFeederStorage();
  profiles = new MemoryFeederProfileRepository();
  credentials = new MemoryDeviceCredentialRepository();
  subscriptions = new MemoryPushSubscriptionRepository();
  users = new MemoryUserRepository();
  sessions = new MemorySessionRepository();
  pets = new MemoryPetRepository();
  petPhotos = new MemoryPetPhotoRepository();
  log.warn("banco: memória (sem MONGO_URL). Os dados somem ao reiniciar.");
}

// 2. Broker MQTT: é por ele que os aparelhos conectam. Cada aparelho entra com a credencial do comedouro dele.
let broker: EmbeddedBroker | null = null;
let mqtt: MqttOptions | null = null;

if (config.broker) {
  const access = new DeviceAccess(credentials, config.broker);
  const started = await startEmbeddedBroker({
    port: config.broker.port,
    authenticate: (username, password) =>
      access.authenticate(username, password),
  });
  broker = started;
  mqtt = {
    url: `mqtt://127.0.0.1:${started.port}`,
    username: config.broker.username,
    password: config.broker.password,
    log,
    disconnect: (feederId) => started.disconnectFeeder(feederId),
  };
  log.info({ port: started.port }, "broker MQTT embutido no ar");
} else {
  log.warn(
    "broker: desligado (sem MQTT_BROKER_PORT). Só comedouros simulados.",
  );
}

const devices = new ServerDeviceFactory(
  {
    clock,
    autoTick: true,
    device: {
      catEatsAfterMinutes:
        config.simCatEatsMinutes > 0 ? config.simCatEatsMinutes : null,
    },
    log,
  },
  mqtt,
);

// 3. Avisos: push quando há chaves VAPID; só o log quando não há.
const notifier: UserNotifier = config.vapid
  ? new WebPushNotifier(subscriptions, config.vapid, log)
  : new LogNotifier(log);
if (!config.vapid) log.warn("push: desligado (sem chaves VAPID).");

// 4. Login: Google quando há GOOGLE_CLIENT_ID.
const identityVerifier = config.auth.googleClientId
  ? new GoogleIdentityVerifier(config.auth.googleClientId)
  : null;
if (!identityVerifier) {
  log.warn("login: sem GOOGLE_CLIENT_ID, o botão do Google não aparece.");
}
if (config.auth.devLogin) {
  log.warn('login: "Entrar como dev" ligado (sem Google).');
}

// 5. Casos de uso e HTTP.
const system = buildSystem({
  profiles,
  storage,
  devices,
  credentials,
  notifier,
  clock,
  users,
  sessions,
  pets,
  petPhotos,
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
});

// Liga os comedouros salvos: cada um publica a configuração e passa a ouvir o dispositivo dele.
await system.catalog.startAll();

const offlineCheck = setInterval(() => {
  system.catalog
    .checkOffline()
    .catch((err: unknown) =>
      log.error({ err }, "erro ao conferir os comedouros"),
    );
}, 60_000);

await app.listen({ port: config.port, host: config.host });

async function shutdown(signal: string) {
  log.info({ signal }, "encerrando");
  clearInterval(offlineCheck);
  await app.close();
  await system.catalog.close();
  await broker?.close();
  await mongo?.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
