import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../../application/credentials.js";
import { DeviceAccess } from "../../application/device-access.js";
import { FeederRuntime } from "../../application/feeder-runtime.js";
import { FeederProfile } from "../../domain/feeder/feeder-profile.js";
import { MqttSimulator } from "../../simulator/mqtt-simulator.js";
import {
  FixedClock,
  MemoryAlertRepository,
  MemoryDeviceCredentialRepository,
  MemoryDeviceEventRepository,
  MemoryDeviceStatusRepository,
  MemoryFeederRepository,
  MemoryNotifier,
} from "../memory/memory-repositories.js";
import { type EmbeddedBroker, startEmbeddedBroker } from "./embedded-broker.js";
import { MqttDevice } from "./mqtt-device.js";

// O caminho de verdade: servidor ↔ broker MQTT ↔ dispositivo (aqui, o "ESP32 de mentira").
// Nenhum caso de uso muda em relação ao dispositivo simulado em memória: só o adaptador.

const NOON = new Date("2026-11-10T15:00:00.000Z");
// O servidor entra com o usuário dele; o aparelho, com a credencial do comedouro "teste".
const USER = "comedouro";
const PASS = "segredo";
const DEVICE_PASS = "senha-do-aparelho";

async function waitFor(check: () => boolean | Promise<boolean>, ms = 5000) {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("tempo esgotado esperando");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("MQTT: servidor, broker e dispositivo", () => {
  let broker: EmbeddedBroker;
  let url: string;
  let clock: FixedClock;
  let device: MqttDevice;
  let system: FeederRuntime;
  let credentials: MemoryDeviceCredentialRepository;
  let events: MemoryDeviceEventRepository;
  let simulators: MqttSimulator[];

  function startServer() {
    device = new MqttDevice({
      url,
      username: USER,
      password: PASS,
      feederId: "teste",
      commandTimeoutMs: 600,
    });
    system = new FeederRuntime(
      FeederProfile.create({
        id: "teste",
        ownerId: "u1",
        nickname: "Teste",
        kind: "aparelho",
        createdAt: NOON,
      }),
      {
        feeder: new MemoryFeederRepository(),
        events,
        status: new MemoryDeviceStatusRepository(),
        alerts: new MemoryAlertRepository(),
      },
      { device, simulator: null, run: () => {}, forget: async () => {} },
      new MemoryNotifier(),
      clock,
    );
    system.devices.start();
  }

  function startSimulator() {
    const simulator = new MqttSimulator({
      url,
      username: "teste",
      password: DEVICE_PASS,
      feederId: "teste",
      clock,
      syncWaitMs: 300,
    });
    simulators.push(simulator);
    return simulator;
  }

  const online = async () => (await system.devices.getStatus()).online;
  const appliedVersion = async () =>
    (await system.devices.getStatus()).config.versaoAplicada;

  beforeEach(async () => {
    credentials = new MemoryDeviceCredentialRepository();
    await credentials.save({
      feederId: "teste",
      username: "teste",
      passwordHash: await hashPassword(DEVICE_PASS),
    });
    const access = new DeviceAccess(credentials, {
      username: USER,
      password: PASS,
    });
    broker = await startEmbeddedBroker({
      port: 0,
      host: "127.0.0.1",
      authenticate: (user, pass) => access.authenticate(user, pass),
    });
    url = `mqtt://127.0.0.1:${broker.port}`;
    clock = new FixedClock(NOON);
    events = new MemoryDeviceEventRepository();
    simulators = [];
    startServer();
    await waitFor(() => device.connected);
    await system.feeders.republish();
  });

  afterEach(async () => {
    for (const simulator of simulators) simulator.crash();
    await device.close();
    await broker.close();
  });

  it("sem dispositivo, servir devolve offline", async () => {
    const result = await system.devices.feedNow(1, false);

    expect(result).toEqual({ result: "offline" });
  });

  it("o dispositivo conecta, recebe a configuração retida e fica sincronizado", async () => {
    startSimulator();

    await waitFor(online);
    await waitFor(async () => (await appliedVersion()) === 1);

    const status = await system.devices.getStatus();
    expect(status.config.sincronizado).toBe(true);
    expect(status.garrafa?.percentual).toBe(100);
  });

  it("servir agora vai e volta pelo broker, e a refeição chega ao histórico", async () => {
    startSimulator();
    await waitFor(online);
    await waitFor(async () => (await appliedVersion()) === 1);

    const result = await system.devices.feedNow(2, false);
    expect(result).toEqual({ result: "aceito" });

    await waitFor(async () =>
      (await system.devices.history(10)).some(
        (e) => e.tipo === "refeicao_servida",
      ),
    );
    const [served] = (await system.devices.history(10)).filter(
      (e) => e.tipo === "refeicao_servida",
    );
    expect(served).toMatchObject({
      porcoes: 2,
      gramas: 12,
      origem: "interface",
    });

    // 10 min depois, o dispositivo recusa pelo intervalo mínimo.
    clock.advanceMinutes(10);
    expect(await system.devices.feedNow(1, false)).toEqual({
      result: "recusado",
      reason: "intervalo",
    });
  });

  it("trocar a agenda chega ao dispositivo, que devolve a versão aplicada", async () => {
    startSimulator();
    await waitFor(online);

    await system.feeders.updateSchedule([
      { hora: "12:30", porcoes: 2, ativo: true },
    ]);

    await waitFor(async () => (await appliedVersion()) === 2);
  });

  it("quando o dispositivo cai sem avisar, o last will deixa o status offline", async () => {
    const simulator = startSimulator();
    await waitFor(online);

    simulator.crash();

    await waitFor(async () => !(await online()));
    expect(await system.devices.feedNow(1, false)).toEqual({
      result: "offline",
    });
  });

  it("senha errada não conecta no broker", async () => {
    const intruder = new MqttSimulator({
      url,
      username: "teste",
      password: "errada",
      feederId: "teste",
      clock,
    });
    simulators.push(intruder);

    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(await online()).toBe(false);
  });

  it("um aparelho não consegue se passar pelo comedouro de outra pessoa", async () => {
    await credentials.save({
      feederId: "outro",
      username: "outro",
      passwordHash: await hashPassword("senha-do-outro"),
    });
    // O aparelho do comedouro "outro" tenta publicar como se fosse o "teste".
    const impostor = new MqttSimulator({
      url,
      username: "outro",
      password: "senha-do-outro",
      feederId: "teste",
      clock,
    });
    simulators.push(impostor);

    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(await online()).toBe(false);
  });

  it("com a credencial apagada (comedouro removido), o aparelho não entra mais", async () => {
    await credentials.removeByFeeder("teste");
    startSimulator();

    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(await online()).toBe(false);
  });

  it("com o servidor parado, o dispositivo segue a agenda; ao voltar, o histórico se completa", async () => {
    await system.feeders.updateSchedule([
      { hora: "12:30", porcoes: 2, ativo: true },
    ]);
    const simulator = startSimulator();
    await waitFor(online);
    await waitFor(async () => (await appliedVersion()) === 2);

    // O servidor sai do ar (a conexão dele com o broker cai).
    await device.close();
    const seenBefore = await events.lastSeq();

    // Passam 31 min: o dispositivo serve o almoço das 12:30 sozinho.
    for (let i = 0; i < 31; i++) {
      clock.advanceMinutes(1);
      simulator.tick();
    }
    expect(await events.lastSeq()).toBe(seenBefore);

    // O servidor volta e manda o `sync` com o último evento que ele tem.
    startServer();
    await waitFor(() => device.connected);
    await system.feeders.republish();
    await device.publishSync(await events.lastSeq());

    await waitFor(async () =>
      (await system.devices.history(10)).some(
        (e) => e.tipo === "refeicao_servida" && e.origem === "agenda",
      ),
    );
  });
});
