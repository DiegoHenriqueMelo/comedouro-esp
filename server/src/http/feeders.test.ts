import { afterEach, describe, expect, it } from "vitest";
import { buildTestSystem } from "../test-support.js";

type TestSystem = Awaited<ReturnType<typeof buildTestSystem>>;

const BIA = {
  sub: "google-bia",
  email: "bia@example.com",
  name: "Bia",
  picture: null,
};

describe("comedouros da conta", () => {
  let t: TestSystem;

  afterEach(async () => {
    await t.system.catalog.close();
    await t.app.close();
  });

  const create = (payload: object) =>
    t.inject({ method: "POST", url: "/v1/comedouros", payload });

  it("GET /v1/comedouros lista os comedouros da conta", async () => {
    t = await buildTestSystem();

    const res = await t.inject({ method: "GET", url: "/v1/comedouros" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      aparelhoDisponivel: false,
      comedouros: [
        {
          id: t.runtime.id,
          apelido: "Cozinha",
          tipo: "simulado",
          criadoEm: expect.any(String),
          online: true,
          alertas: 1, // o "reiniciou" de quando o simulado liga
        },
      ],
    });
  });

  it("o status traz o apelido e o tipo", async () => {
    t = await buildTestSystem();

    const status = (
      await t.inject({ method: "GET", url: `${t.base}/status` })
    ).json();

    expect(status).toMatchObject({
      apelido: "Cozinha",
      tipo: "simulado",
      simulado: true,
    });
  });

  describe("criar", () => {
    it("um segundo simulado na mesma conta: 422 limite_de_simulados", async () => {
      t = await buildTestSystem();

      const res = await create({ apelido: "Sala", tipo: "simulado" });

      expect(res.statusCode).toBe(422);
      expect(res.json().motivo).toBe("limite_de_simulados");
    });

    it("aparelho num servidor sem broker: 422 aparelho_indisponivel", async () => {
      t = await buildTestSystem();

      const res = await create({ apelido: "Sala", tipo: "aparelho" });

      expect(res.statusCode).toBe(422);
      expect(res.json().motivo).toBe("aparelho_indisponivel");
    });

    it("aparelho: devolve o usuário e a senha MQTT uma vez, e guarda só o hash", async () => {
      t = await buildTestSystem({ supportsHardware: true });

      const res = await create({ apelido: " Sala ", tipo: "aparelho" });

      expect(res.statusCode).toBe(201);
      const { comedouro, credencial } = res.json();
      expect(comedouro).toMatchObject({ apelido: "Sala", tipo: "aparelho" });
      expect(credencial.usuario).toBe(comedouro.id);
      expect(credencial.senha.length).toBeGreaterThanOrEqual(20);

      const saved = await t.credentials.findByUsername(credencial.usuario);
      expect(saved?.passwordHash).toMatch(/^scrypt:/);
      expect(saved?.passwordHash).not.toContain(credencial.senha);

      const list = (
        await t.inject({ method: "GET", url: "/v1/comedouros" })
      ).json();
      expect(list.comedouros).toHaveLength(2);
    });

    it("apelido vazio ou com mais de 30 letras: 422 apelido_invalido", async () => {
      t = await buildTestSystem();
      await t.inject({ method: "DELETE", url: t.base });

      for (const apelido of ["  ", "x".repeat(31)]) {
        const res = await create({ apelido, tipo: "simulado" });
        expect(res.statusCode).toBe(422);
        expect(res.json().motivo).toBe("apelido_invalido");
      }
    });

    it("tipo desconhecido: 400", async () => {
      t = await buildTestSystem();

      const res = await create({ apelido: "Sala", tipo: "robo" });

      expect(res.statusCode).toBe(400);
    });

    it("o 11º comedouro da conta: 422 limite_de_comedouros", async () => {
      t = await buildTestSystem({ supportsHardware: true });
      for (let i = 2; i <= 10; i++) {
        const res = await create({
          apelido: `Aparelho ${i}`,
          tipo: "aparelho",
        });
        expect(res.statusCode).toBe(201);
      }

      const res = await create({ apelido: "Mais um", tipo: "aparelho" });

      expect(res.statusCode).toBe(422);
      expect(res.json().motivo).toBe("limite_de_comedouros");
    });
  });

  describe("trocar o apelido", () => {
    it("PATCH muda o apelido, e os avisos passam a usar o nome novo", async () => {
      t = await buildTestSystem();

      const res = await t.inject({
        method: "PATCH",
        url: t.base,
        payload: { apelido: "Varanda" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().apelido).toBe("Varanda");

      await t.runtime.devices.registerEvent({
        seq: 99,
        type: "refeicao_pulada",
        at: t.clock.now(),
      });
      expect(t.notifier.sent.at(-1)?.title).toBe("Varanda: Refeição pulada");
    });

    it("apelido inválido não muda nada", async () => {
      t = await buildTestSystem();

      const res = await t.inject({
        method: "PATCH",
        url: t.base,
        payload: { apelido: "" },
      });

      expect(res.statusCode).toBe(422);
      expect(t.runtime.profile.nickname).toBe("Cozinha");
    });
  });

  describe("remover", () => {
    it("DELETE apaga o comedouro e todos os dados dele", async () => {
      t = await buildTestSystem();
      await t.inject({
        method: "POST",
        url: `${t.base}/feed`,
        payload: { porcoes: 1 },
      });

      const res = await t.inject({ method: "DELETE", url: t.base });

      expect(res.statusCode).toBe(204);
      expect(t.storage.has(t.runtime.id)).toBe(false);
      expect(await t.profiles.findById(t.runtime.id)).toBeNull();
      expect(
        (await t.inject({ method: "GET", url: `${t.base}/status` })).statusCode,
      ).toBe(404);
      expect(
        (await t.inject({ method: "GET", url: "/v1/comedouros" })).json()
          .comedouros,
      ).toEqual([]);
    });

    it("remover um aparelho apaga a credencial: ele não entra mais no broker", async () => {
      t = await buildTestSystem({ supportsHardware: true });
      const { comedouro, credencial } = (
        await create({ apelido: "Sala", tipo: "aparelho" })
      ).json();

      await t.inject({
        method: "DELETE",
        url: `/v1/comedouros/${comedouro.id}`,
      });

      expect(await t.credentials.findByUsername(credencial.usuario)).toBeNull();
    });
  });

  describe("cada conta só enxerga o que é dela (D17)", () => {
    it("outra conta não vê o comedouro na lista", async () => {
      t = await buildTestSystem();
      const bia = await t.loginAs(BIA);

      const res = await t.injectAs(bia.cookie, {
        method: "GET",
        url: "/v1/comedouros",
      });

      expect(res.json().comedouros).toEqual([]);
    });

    it.each([
      ["GET", "/status"],
      ["GET", "/schedules"],
      ["PUT", "/schedules"],
      ["GET", "/config"],
      ["GET", "/history"],
      ["POST", "/feed"],
      ["POST", "/alerts/ack"],
      ["POST", "/simulador"],
      ["PATCH", ""],
      ["DELETE", ""],
    ] as const)(
      "%s %s do comedouro de outra conta: 404",
      async (method, path) => {
        t = await buildTestSystem();
        const bia = await t.loginAs(BIA);

        const res = await t.injectAs(bia.cookie, {
          method,
          url: `${t.base}${path}`,
          ...(method === "GET" || method === "DELETE" ? {} : { payload: {} }),
        });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ motivo: "nao_encontrado" });
      },
    );

    it("um id que não existe responde igual: 404", async () => {
      t = await buildTestSystem();

      const res = await t.inject({
        method: "GET",
        url: "/v1/comedouros/nao-existe/status",
      });

      expect(res.statusCode).toBe(404);
    });

    it("a tentativa de outra conta não apaga nada", async () => {
      t = await buildTestSystem();
      const bia = await t.loginAs(BIA);

      await t.injectAs(bia.cookie, { method: "DELETE", url: t.base });

      expect(await t.profiles.findById(t.runtime.id)).not.toBeNull();
    });

    it("duas contas com um simulado cada: agendas independentes", async () => {
      t = await buildTestSystem();
      const bia = await t.loginAs(BIA);
      const created = await t.injectAs(bia.cookie, {
        method: "POST",
        url: "/v1/comedouros",
        payload: { apelido: "Quarto", tipo: "simulado" },
      });
      const biaBase = `/v1/comedouros/${created.json().comedouro.id}`;

      await t.injectAs(bia.cookie, {
        method: "PUT",
        url: `${biaBase}/schedules`,
        payload: [{ hora: "07:00", porcoes: 2, ativo: true }],
      });

      const mine = (
        await t.inject({ method: "GET", url: `${t.base}/schedules` })
      ).json();
      const hers = (
        await t.injectAs(bia.cookie, {
          method: "GET",
          url: `${biaBase}/schedules`,
        })
      ).json();
      expect(mine.agenda).toEqual([]);
      expect(hers.agenda).toEqual([{ hora: "07:00", porcoes: 2, ativo: true }]);
    });

    it("o aviso de um comedouro vai só para o dono dele", async () => {
      t = await buildTestSystem();
      await t.loginAs(BIA);

      await t.runtime.devices.registerEvent({
        seq: 99,
        type: "refeicao_pulada",
        at: t.clock.now(),
      });

      const users = new Set(t.notifier.sent.map((n) => n.userId));
      expect(users).toEqual(new Set([t.user.id]));
    });
  });
});
