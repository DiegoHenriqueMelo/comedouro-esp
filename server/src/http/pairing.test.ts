import { afterEach, describe, expect, it } from "vitest";
import { verifyPassword } from "../application/credentials.js";
import { buildTestSystem } from "../test-support.js";

type TestSystem = Awaited<ReturnType<typeof buildTestSystem>>;

const BIA = {
  sub: "google-bia",
  email: "bia@example.com",
  name: "Bia",
  picture: null,
};

describe("pareamento", () => {
  let t: TestSystem;

  afterEach(async () => {
    await t.system.catalog.close();
    await t.app.close();
  });

  // Cria um comedouro de aparelho e devolve o id e o código.
  async function newDevice(apelido = "Sala") {
    const res = await t.inject({
      method: "POST",
      url: "/v1/comedouros",
      payload: { apelido, tipo: "aparelho" },
    });
    const body = res.json();
    return {
      id: body.comedouro.id as string,
      code: body.codigo.codigo as string,
    };
  }

  // O ESP32 chamando, sem sessão.
  const pair = (codigo: string, ip = "10.0.0.5") =>
    t.app.inject({
      method: "POST",
      url: "/v1/dispositivos/parear",
      payload: { codigo },
      remoteAddress: ip,
    });

  it("o aparelho troca o código pelo usuário e pela senha MQTT, e o comedouro fica pareado", async () => {
    t = await buildTestSystem({ supportsHardware: true });
    const { id, code } = await newDevice();

    const res = await pair(code);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      comedouro: id,
      usuario: id,
      senha: expect.any(String),
      mqtt: { porta: 1883 },
    });
    const saved = await t.credentials.findByUsername(id);
    expect(await verifyPassword(body.senha, saved?.passwordHash ?? "")).toBe(
      true,
    );

    const status = (
      await t.inject({ method: "GET", url: `/v1/comedouros/${id}/status` })
    ).json();
    expect(status.pareado).toBe(true);
    expect(status.pareadoEm).toBe(t.clock.now().toISOString());
  });

  it("aceita o código com espaço ou traço, como a pessoa lê na tela", async () => {
    t = await buildTestSystem({ supportsHardware: true });
    const { code } = await newDevice();

    const res = await pair(`${code.slice(0, 3)} ${code.slice(3)}`);

    expect(res.statusCode).toBe(200);
  });

  it("o código serve uma vez só", async () => {
    t = await buildTestSystem({ supportsHardware: true });
    const { code } = await newDevice();
    await pair(code);

    const again = await pair(code);

    expect(again.statusCode).toBe(422);
    expect(again.json().motivo).toBe("codigo_invalido");
  });

  it("depois de 10 minutos, o código vence", async () => {
    t = await buildTestSystem({ supportsHardware: true });
    const { code } = await newDevice();

    t.clock.advanceMinutes(10);
    const res = await pair(code);

    expect(res.statusCode).toBe(422);
    expect(res.json().motivo).toBe("codigo_invalido");
  });

  it("código que não existe: a mesma resposta, sem dizer o porquê", async () => {
    t = await buildTestSystem({ supportsHardware: true });

    const res = await pair("000000");

    expect(res.statusCode).toBe(422);
    expect(res.json().motivo).toBe("codigo_invalido");
  });

  it("5 erros do mesmo IP em 10 minutos: bloqueado (429), até para um código certo; outro IP segue livre", async () => {
    t = await buildTestSystem({ supportsHardware: true });
    const { code } = await newDevice();
    const wrong = code === "000000" ? "000001" : "000000";

    for (let i = 0; i < 5; i++) {
      expect((await pair(wrong)).statusCode).toBe(422);
    }

    const blocked = await pair(code);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ motivo: "muitas_tentativas" });

    expect((await pair(code, "10.0.0.9")).statusCode).toBe(200);
  });

  it("passados os 10 minutos, o IP pode tentar de novo", async () => {
    t = await buildTestSystem({ supportsHardware: true });
    for (let i = 0; i < 5; i++) await pair("000000");

    t.clock.advanceMinutes(10);
    const { code } = await newDevice();

    expect((await pair(code)).statusCode).toBe(200);
  });

  describe("o código no app", () => {
    it("GET mostra o código que ainda vale; depois de usado, nenhum", async () => {
      t = await buildTestSystem({ supportsHardware: true });
      const { id, code } = await newDevice();
      const get = () =>
        t.inject({ method: "GET", url: `/v1/comedouros/${id}/codigo` });

      expect((await get()).json().codigo.codigo).toBe(code);

      await pair(code);
      expect((await get()).json()).toEqual({ codigo: null });
    });

    it("gerar outro invalida o anterior", async () => {
      t = await buildTestSystem({ supportsHardware: true });
      const { id, code } = await newDevice();

      const res = await t.inject({
        method: "POST",
        url: `/v1/comedouros/${id}/codigo`,
      });
      expect(res.statusCode).toBe(201);
      const fresh = res.json().codigo.codigo;

      if (fresh !== code) expect((await pair(code)).statusCode).toBe(422);
      expect((await pair(fresh)).statusCode).toBe(200);
    });

    it("parear de novo troca a senha: a antiga deixa de valer, e a agenda continua", async () => {
      t = await buildTestSystem({ supportsHardware: true });
      const { id, code } = await newDevice();
      const first = (await pair(code)).json();
      await t.inject({
        method: "PUT",
        url: `/v1/comedouros/${id}/schedules`,
        payload: [{ hora: "07:00", porcoes: 2, ativo: true }],
      });

      const again = (
        await t.inject({ method: "POST", url: `/v1/comedouros/${id}/codigo` })
      ).json().codigo.codigo;
      const second = (await pair(again)).json();

      const saved = await t.credentials.findByUsername(id);
      expect(await verifyPassword(first.senha, saved?.passwordHash ?? "")).toBe(
        false,
      );
      expect(
        await verifyPassword(second.senha, saved?.passwordHash ?? ""),
      ).toBe(true);
      const agenda = (
        await t.inject({ method: "GET", url: `/v1/comedouros/${id}/schedules` })
      ).json().agenda;
      expect(agenda).toEqual([{ hora: "07:00", porcoes: 2, ativo: true }]);
    });

    it("simulado não tem código: 422 nao_e_aparelho", async () => {
      t = await buildTestSystem();

      const res = await t.inject({ method: "POST", url: `${t.base}/codigo` });

      expect(res.statusCode).toBe(422);
      expect(res.json().motivo).toBe("nao_e_aparelho");
    });

    it("o código do comedouro de outra conta: 404", async () => {
      t = await buildTestSystem({ supportsHardware: true });
      const { id } = await newDevice();
      const bia = await t.loginAs(BIA);

      for (const method of ["GET", "POST"] as const) {
        const res = await t.injectAs(bia.cookie, {
          method,
          url: `/v1/comedouros/${id}/codigo`,
        });
        expect(res.statusCode).toBe(404);
      }
    });
  });
});
