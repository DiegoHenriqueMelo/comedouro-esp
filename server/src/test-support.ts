import type { InjectOptions } from "fastify";
import { type AppOptions, buildApp } from "./app.js";
import { buildSystem } from "./composition.js";
import { SESSION_COOKIE } from "./http/auth-routes.js";
import {
  FakeIdentityVerifier,
  FixedClock,
  MemoryAlertRepository,
  MemoryDeviceEventRepository,
  MemoryDeviceStatusRepository,
  MemoryFeederRepository,
  MemoryNotifier,
  MemoryPushSubscriptionRepository,
  MemorySessionRepository,
  MemoryUserRepository,
} from "./infra/memory/memory-repositories.js";
import { InProcessDevice } from "./infra/simulated/in-process-device.js";
import type { SimulatedDeviceOptions } from "./infra/simulated/simulated-device.js";

// 10/11/2026, 12:00 em Brasília (15:00 UTC).
export const NOON = new Date("2026-11-10T15:00:00.000Z");

// Monta o sistema inteiro em memória, com relógio controlado e o dispositivo simulado.
export async function buildTestSystem(
  options: {
    now?: Date;
    device?: Omit<SimulatedDeviceOptions, "clock" | "emitEvent">;
    auth?: Partial<AppOptions["auth"]>;
  } = {},
) {
  const clock = new FixedClock(options.now ?? NOON);
  const device = new InProcessDevice(clock, options.device);
  const notifier = new MemoryNotifier();
  const subscriptions = new MemoryPushSubscriptionRepository();
  const feederRepository = new MemoryFeederRepository();
  const eventRepository = new MemoryDeviceEventRepository();
  const google = new FakeIdentityVerifier();
  const users = new MemoryUserRepository();
  const sessions = new MemorySessionRepository();

  const system = buildSystem({
    feederRepository,
    eventRepository,
    statusRepository: new MemoryDeviceStatusRepository(),
    alertRepository: new MemoryAlertRepository(),
    device,
    notifier,
    clock,
    users,
    sessions,
    identityVerifier: google,
  });

  system.devices.start();
  await system.feeders.republish();
  await device.settled();

  const app = buildApp({
    system,
    push: { publicKey: "chave-de-teste", subscriptions, notifier },
    simulator: device.simulated,
    auth: {
      googleClientId: "id-de-teste.apps.googleusercontent.com",
      devLogin: false,
      secureCookie: false,
      ...options.auth,
    },
  });

  // Uma conta já logada: os testes de API usam `inject`, que manda o cookie dela.
  const { token, user } = await system.auth.loginAs({
    sub: "google-tutor",
    email: "tutor@example.com",
    name: "Tutor",
    picture: null,
  });
  const cookie = `${SESSION_COOKIE}=${token}`;

  return {
    app,
    system,
    clock,
    device,
    simulated: device.simulated,
    notifier,
    subscriptions,
    feederRepository,
    eventRepository,
    google,
    users,
    sessions,
    user,
    cookie,
    // Uma chamada à API como o usuário logado.
    inject(request: InjectOptions) {
      return app.inject({
        ...request,
        headers: { ...request.headers, cookie },
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
