import { describe, expect, it } from "vitest";
import { buildTestSystem } from "../test-support.js";

type TestSystem = Awaited<ReturnType<typeof buildTestSystem>>;

async function openAlerts(t: TestSystem): Promise<string[]> {
  const status = await t.system.devices.getStatus();
  return status.alertas.map((a) => a.tipo);
}

async function simulate(t: TestSystem, payload: object) {
  const res = await t.app.inject({
    method: "POST",
    url: "/v1/simulador",
    payload,
  });
  expect(res.statusCode).toBe(200);
}

describe("alertas", () => {
  it("ao ligar, abre o alerta de reinício e avisa uma vez", async () => {
    const t = await buildTestSystem();

    expect(await openAlerts(t)).toEqual(["reiniciou"]);
    expect(t.notifier.sent).toHaveLength(1);
    expect(t.notifier.sent[0]?.title).toBe("O alimentador reiniciou");
  });

  it("garrafa abaixo de 20% abre o alerta com os dias que faltam", async () => {
    const t = await buildTestSystem();
    await t.app.inject({
      method: "PUT",
      url: "/v1/schedules",
      payload: [{ hora: "07:30", porcoes: 5, ativo: true }],
    });

    await simulate(t, { garrafaGramas: 100 }); // 100 g de 900 g = 11%

    expect(await openAlerts(t)).toContain("garrafa_baixa");
    const aviso = t.notifier.sent.find((n) => n.title === "Ração acabando");
    // 5 porções de 6 g por dia = 30 g por dia; 100 g dão para 3 dias.
    expect(aviso?.body).toContain("11%");
    expect(aviso?.body).toContain("3 dia");
  });

  it("R13: o mesmo problema não avisa de novo a cada estado recebido", async () => {
    const t = await buildTestSystem();

    await simulate(t, { garrafaGramas: 100 });
    await simulate(t, { garrafaGramas: 90 });
    await simulate(t, { garrafaGramas: 80 });

    const avisos = t.notifier.sent.filter((n) => n.title === "Ração acabando");
    expect(avisos).toHaveLength(1);
  });

  it("reabastecer fecha o alerta sozinho, e um problema novo avisa de novo", async () => {
    const t = await buildTestSystem();

    await simulate(t, { garrafaGramas: 100 });
    await simulate(t, { garrafaGramas: 900 });
    expect(await openAlerts(t)).not.toContain("garrafa_baixa");

    await simulate(t, { garrafaGramas: 100 });
    const avisos = t.notifier.sent.filter((n) => n.title === "Ração acabando");
    expect(avisos).toHaveLength(2);
  });

  it("sensor sem leitura abre o alerta e fecha quando o sensor volta", async () => {
    const t = await buildTestSystem();

    await simulate(t, { balanca: false });
    expect(await openAlerts(t)).toContain("sensor_sem_leitura");

    await simulate(t, { balanca: true });
    expect(await openAlerts(t)).not.toContain("sensor_sem_leitura");
  });

  it("'entendi' fecha os alertas que não se resolvem sozinhos", async () => {
    const t = await buildTestSystem();
    expect(await openAlerts(t)).toEqual(["reiniciou"]);

    const res = await t.app.inject({ method: "POST", url: "/v1/alerts/ack" });

    expect(res.statusCode).toBe(200);
    expect(await openAlerts(t)).toEqual([]);
  });

  it("dispositivo offline há mais de 30 min abre o alerta; ao voltar, fecha", async () => {
    const t = await buildTestSystem();
    await t.system.devices.registerOnline(false);

    t.clock.advanceMinutes(29);
    await t.system.devices.checkOffline();
    expect(await openAlerts(t)).not.toContain("offline");

    t.clock.advanceMinutes(2);
    await t.system.devices.checkOffline();
    await t.system.devices.checkOffline();
    expect(await openAlerts(t)).toContain("offline");
    expect(
      t.notifier.sent.filter((n) => n.title === "Alimentador offline"),
    ).toHaveLength(1);

    await t.system.devices.registerOnline(true);
    expect(await openAlerts(t)).not.toContain("offline");
  });

  it("o mesmo evento recebido duas vezes vale uma vez", async () => {
    const t = await buildTestSystem();
    const event = {
      seq: 50,
      type: "refeicao_pulada" as const,
      at: t.clock.now(),
    };

    await t.system.devices.registerEvent(event);
    await t.system.devices.registerEvent(event);

    const history = await t.system.devices.history(50);
    expect(history.filter((e) => e.seq === 50)).toHaveLength(1);
    expect(
      t.notifier.sent.filter((n) => n.title === "Refeição pulada"),
    ).toHaveLength(1);
  });

  it("um evento que chega fora de ordem entra no lugar certo do histórico", async () => {
    const t = await buildTestSystem();
    const at = (minutes: number) =>
      new Date(t.clock.now().getTime() + minutes * 60_000);

    await t.system.devices.registerEvent({
      seq: 11,
      type: "refeicao_servida",
      at: at(20),
      portions: 1,
    });
    await t.system.devices.registerEvent({
      seq: 10,
      type: "refeicao_servida",
      at: at(10),
      portions: 2,
    });

    const history = await t.system.devices.history(2);
    expect(history.map((e) => e.seq)).toEqual([11, 10]);
  });
});

describe("notificações push: inscrição", () => {
  it("a chave pública, a inscrição e a remoção", async () => {
    const t = await buildTestSystem();
    const subscription = {
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: "chave", auth: "segredo" },
    };

    const key = await t.app.inject({
      method: "GET",
      url: "/v1/push/public-key",
    });
    expect(key.json()).toEqual({ chave: "chave-de-teste" });

    const added = await t.app.inject({
      method: "POST",
      url: "/v1/push/subscribe",
      payload: subscription,
    });
    expect(added.statusCode).toBe(201);
    expect(await t.subscriptions.list()).toEqual([subscription]);

    await t.app.inject({
      method: "POST",
      url: "/v1/push/unsubscribe",
      payload: { endpoint: subscription.endpoint },
    });
    expect(await t.subscriptions.list()).toEqual([]);
  });

  it("inscrição sem as chaves devolve 400", async () => {
    const t = await buildTestSystem();

    const res = await t.app.inject({
      method: "POST",
      url: "/v1/push/subscribe",
      payload: { endpoint: "https://push.example.com/abc" },
    });

    expect(res.statusCode).toBe(400);
  });
});
