import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ErroDeDominio } from "../domain/shared/erro-de-dominio.js";
import { buildTestSystem } from "../test-support.js";

type TestSystem = Awaited<ReturnType<typeof buildTestSystem>>;

describe("API /v1: manutenção e conflito", () => {
  let t: TestSystem;

  beforeEach(async () => {
    t = await buildTestSystem();
  });
  afterEach(() => t.app.close());

  const post = (url: string, payload?: object) =>
    t.app.inject({ method: "POST", url, ...(payload ? { payload } : {}) });

  it("tarar a balança zera a tigela", async () => {
    t.simulated.setBowlGrams(30);

    const res = await post("/v1/scale/tare");

    expect(res.statusCode).toBe(200);
    expect(t.simulated.state().bowl.grams).toBe(0);
  });

  it("calibrar a balança e testar o servo são aceitos", async () => {
    const scale = await post("/v1/scale/calibrate", { gramas: 500 });
    const servo = await post("/v1/servo/test", { angulo: 60 });

    expect(scale.statusCode).toBe(200);
    expect(servo.statusCode).toBe(200);
  });

  it("corpo errado nos comandos devolve 400", async () => {
    expect((await post("/v1/scale/calibrate", { gramas: -5 })).statusCode).toBe(
      400,
    );
    expect((await post("/v1/servo/test", { angulo: 200 })).statusCode).toBe(
      400,
    );
    expect((await post("/v1/calibrate", { porcoes: 0 })).statusCode).toBe(400);
  });

  it("soltar porções para pesar não conta no limite diário nem entra no histórico de refeições", async () => {
    const res = await post("/v1/calibrate", { porcoes: 20 });
    await t.device.settled();

    expect(res.statusCode).toBe(200);
    expect(t.simulated.state().bowl.grams).toBe(120); // 20 porções de 6 g

    const status = (
      await t.app.inject({ method: "GET", url: "/v1/status" })
    ).json();
    expect(status.hoje.porcoes).toBe(0);
  });

  it("comando enquanto o alimentador serve devolve 409", async () => {
    await post("/v1/feed", { porcoes: 2 });

    const res = await post("/v1/scale/tare");

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ motivo: "ocupado" });
  });

  it("duas edições ao mesmo tempo: o conflito de versão vira 409", async () => {
    t.feederRepository.save = async () => {
      throw new ErroDeDominio("conflito_de_versao", "a versão salva é outra");
    };

    const res = await t.app.inject({
      method: "PUT",
      url: "/v1/schedules",
      payload: [{ hora: "07:30", porcoes: 2, ativo: true }],
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().motivo).toBe("conflito_de_versao");
  });

  it("o simulador só mexe no mundo físico por /v1/simulador, e valida o corpo", async () => {
    const ok = await post("/v1/simulador", { tigelaGramas: 25 });
    const bad = await post("/v1/simulador", { tigelaGramas: -1 });

    expect(ok.statusCode).toBe(200);
    expect(t.simulated.state().bowl.grams).toBe(25);
    expect(bad.statusCode).toBe(400);
  });
});
