import type { InjectOptions } from "fastify";
import { type AppOptions, buildApp } from "./app.js";
import { buildSystem } from "./composition.js";
import type { Identity } from "./domain/user/user.js";
import { SESSION_COOKIE } from "./http/auth-routes.js";
import { ServerDeviceFactory } from "./infra/device-factory.js";
import {
  FakeIdentityVerifier,
  FixedClock,
  MemoryDeviceCredentialRepository,
  MemoryFeederProfileRepository,
  MemoryFeederStorage,
  MemoryNotifier,
  MemoryPetPhotoRepository,
  MemoryPetRepository,
  MemoryPushSubscriptionRepository,
  MemorySessionRepository,
  MemoryUserRepository,
} from "./infra/memory/memory-repositories.js";
import type { SimulatedDeviceOptions } from "./infra/simulated/simulated-device.js";

// 10/11/2026, 12:00 em Brasília (15:00 UTC).
export const NOON = new Date("2026-11-10T15:00:00.000Z");

export const TUTOR: Identity = {
  sub: "google-tutor",
  email: "tutor@example.com",
  name: "Tutor",
  picture: null,
};

// Monta o sistema inteiro em memória, com relógio controlado, uma conta logada e um comedouro simulado.
export async function buildTestSystem(
  options: {
    now?: Date;
    device?: Omit<SimulatedDeviceOptions, "clock" | "emitEvent">;
    auth?: Partial<AppOptions["auth"]>;
    // Sem broker por padrão: só dá para criar comedouros simulados.
    supportsHardware?: boolean;
  } = {},
) {
  const clock = new FixedClock(options.now ?? NOON);
  const devices = new ServerDeviceFactory(
    {
      clock,
      autoTick: false,
      ...(options.device ? { device: options.device } : {}),
    },
    options.supportsHardware
      ? { url: "mqtt://127.0.0.1:1", username: "servidor", password: "x" }
      : null,
  );
  const notifier = new MemoryNotifier();
  const subscriptions = new MemoryPushSubscriptionRepository();
  const storage = new MemoryFeederStorage();
  const profiles = new MemoryFeederProfileRepository();
  const credentials = new MemoryDeviceCredentialRepository();
  const google = new FakeIdentityVerifier();
  const users = new MemoryUserRepository();
  const sessions = new MemorySessionRepository();
  const pets = new MemoryPetRepository();
  const petPhotos = new MemoryPetPhotoRepository();

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
    identityVerifier: google,
  });

  const app = buildApp({
    system,
    push: { publicKey: "chave-de-teste", subscriptions, notifier },
    auth: {
      googleClientId: "id-de-teste.apps.googleusercontent.com",
      devLogin: false,
      secureCookie: false,
      ...options.auth,
    },
  });

  // Uma conta já logada: os testes de API usam `inject`, que manda o cookie dela.
  const loginAs = async (identity: Identity) => {
    const { token, user } = await system.auth.loginAs(identity);
    return { user, cookie: `${SESSION_COOKIE}=${token}` };
  };
  const { user, cookie } = await loginAs(TUTOR);

  // E um comedouro simulado dessa conta.
  const { runtime } = await system.catalog.create(
    user.id,
    "Cozinha",
    "simulado",
  );
  const device = devices.simulated.get(runtime.id);
  if (!device) throw new Error("o comedouro de teste não criou o simulado");
  await device.settled();

  return {
    app,
    system,
    clock,
    devices,
    storage,
    profiles,
    credentials,
    notifier,
    subscriptions,
    google,
    pets,
    petPhotos,
    users,
    sessions,
    user,
    cookie,
    loginAs,
    // O comedouro de teste e o caminho dele na API.
    runtime,
    base: `/v1/comedouros/${runtime.id}`,
    device,
    simulated: device.simulated,
    feederRepository: runtime.repositories.feeder,
    eventRepository: runtime.repositories.events,
    // Uma chamada à API como o usuário logado.
    inject(request: InjectOptions) {
      return app.inject({
        ...request,
        headers: { ...request.headers, cookie },
      });
    },
    // A mesma chamada, como outra conta.
    injectAs(otherCookie: string, request: InjectOptions) {
      return app.inject({
        ...request,
        headers: { ...request.headers, cookie: otherCookie },
      });
    },
    // Avança o relógio e deixa o dispositivo rodar a agenda, minuto a minuto.
    async advance(minutes: number) {
      for (let i = 0; i < minutes; i++) {
        clock.advanceMinutes(1);
        device.tick();
      }
      await device.settled();
    },
  };
}
