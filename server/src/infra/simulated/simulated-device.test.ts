import { describe, expect, it } from "vitest";
import { buildTestSystem } from "../../test-support.js";

type TestSystem = Awaited<ReturnType<typeof buildTestSystem>>;

// 12:00 em Brasília é o começo de todos os testes (NOON).
const almoco = { hora: "12:30", porcoes: 2, ativo: true };

async function setSchedule(t: TestSystem, agenda: object[]) {
  const res = await t.app.inject({
    method: "PUT",
    url: "/v1/schedules",
    payload: agenda,
  });
  expect(res.statusCode).toBe(200);
  await t.device.settled();
}

async function types(t: TestSystem): Promise<string[]> {
  const history = await t.system.devices.history(50);
  return history.map((e) => e.tipo).reverse(); // do mais antigo para o mais recente
}

describe("dispositivo simulado: a agenda", () => {
  it("ao ligar, registra que reiniciou", async () => {
    const t = await buildTestSystem();

    expect(await types(t)).toEqual(["reiniciou"]);
  });

  it("serve a refeição agendada no horário, uma vez só", async () => {
    const t = await buildTestSystem();
    await setSchedule(t, [almoco]);

    await t.advance(29);
    expect(await types(t)).toEqual(["reiniciou"]);

    // Chega 12:30 e o loop roda várias vezes no mesmo minuto e nos seguintes.
    await t.advance(1);
    t.device.tick();
    t.device.tick();
    await t.advance(30);

    expect(await types(t)).toEqual(["reiniciou", "refeicao_servida"]);
    const [served] = await t.system.devices.history(1);
    expect(served).toMatchObject({ porcoes: 2, gramas: 12, origem: "agenda" });
  });

  it("refeição desativada não é servida", async () => {
    const t = await buildTestSystem();
    await setSchedule(t, [{ ...almoco, ativo: false }]);

    await t.advance(60);

    expect(await types(t)).toEqual(["reiniciou"]);
  });

  it("a refeição de um horário que já passou quando o dispositivo ligou não é servida", async () => {
    const t = await buildTestSystem();
    await setSchedule(t, [{ hora: "08:00", porcoes: 1, ativo: true }]);

    await t.advance(30);

    expect(await types(t)).toEqual(["reiniciou"]);
  });

  it("com ração na tigela, adia a refeição e serve quando a tigela esvazia", async () => {
    const t = await buildTestSystem();
    await setSchedule(t, [almoco]);
    t.simulated.setBowlGrams(30);

    await t.advance(35); // 12:35: adiou às 12:30
    expect(await types(t)).toEqual(["reiniciou", "refeicao_adiada"]);

    t.simulated.setBowlGrams(0);
    await t.advance(20); // tenta de novo às 12:50

    expect(await types(t)).toEqual([
      "reiniciou",
      "refeicao_adiada",
      "refeicao_servida",
    ]);
  });

  it("depois de 2 h com ração na tigela, pula a refeição e avisa", async () => {
    const t = await buildTestSystem();
    await setSchedule(t, [almoco]);
    t.simulated.setBowlGrams(30);

    await t.advance(30 + 125);

    expect(await types(t)).toEqual([
      "reiniciou",
      "refeicao_adiada",
      "refeicao_pulada",
    ]);
    expect(t.notifier.sent.map((n) => n.title)).toContain("Refeição pulada");
  });

  it("sem balança, a agenda continua só com os limites", async () => {
    const t = await buildTestSystem();
    await setSchedule(t, [almoco]);
    t.simulated.setBowlGrams(30);
    t.simulated.setSensors({ scale: false, level: true });

    await t.advance(31);

    expect(await types(t)).toContain("refeicao_servida");
  });

  it("uma refeição agendada que passaria do limite diário é recusada e registrada", async () => {
    const t = await buildTestSystem();
    // A agenda (2 porções) cabe no limite de 10; o pedido manual de 9 é que estoura o dia.
    await setSchedule(t, [{ hora: "13:00", porcoes: 2, ativo: true }]);
    await t.app.inject({
      method: "POST",
      url: "/v1/feed",
      payload: { porcoes: 9 },
    });

    await t.advance(61);

    const history = await t.system.devices.history(1);
    expect(history[0]).toMatchObject({
      tipo: "refeicao_recusada",
      motivo: "limite_diario",
      origem: "agenda",
    });
  });

  it("a virada da meia-noite zera o contador do dia", async () => {
    const t = await buildTestSystem();
    await t.app.inject({
      method: "POST",
      url: "/v1/feed",
      payload: { porcoes: 10 },
    });

    await t.advance(60);
    const mesmoDia = await t.app.inject({
      method: "POST",
      url: "/v1/feed",
      payload: {},
    });
    expect(mesmoDia.json()).toEqual({ motivo: "limite_diario" });

    await t.advance(12 * 60); // passa da meia-noite
    t.simulated.setBowlGrams(0); // o gato comeu
    const diaSeguinte = await t.app.inject({
      method: "POST",
      url: "/v1/feed",
      payload: {},
    });
    expect(diaSeguinte.statusCode).toBe(202);
  });

  it("com a garrafa vazia, a porção não sai: entra em VAZIO e só volta depois de reconhecer", async () => {
    const t = await buildTestSystem();
    t.simulated.setBottleGrams(0);

    const res = await t.app.inject({
      method: "POST",
      url: "/v1/feed",
      payload: {},
    });
    await t.device.settled();

    expect(res.statusCode).toBe(202);
    expect(await types(t)).toEqual(["reiniciou", "garrafa_vazia"]);
    expect(t.simulated.state().state).toBe("vazio");

    const emVazio = await t.app.inject({
      method: "POST",
      url: "/v1/feed",
      payload: {},
    });
    expect(emVazio.statusCode).toBe(409);

    await t.app.inject({ method: "POST", url: "/v1/alerts/ack" });
    await t.device.settled();
    expect(t.simulated.state().state).toBe("ocioso");
  });
});
