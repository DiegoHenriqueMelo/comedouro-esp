import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestSystem } from "./test-support.js";

type TestSystem = Awaited<ReturnType<typeof buildTestSystem>>;

const cafe = { hora: "07:30", porcoes: 2, ativo: true };
const jantar = { hora: "18:00", porcoes: 3, ativo: true };

describe("API /v1", () => {
  let t: TestSystem;

  beforeEach(async () => {
    t = await buildTestSystem();
  });
  afterEach(() => t.app.close());

  it("GET /health responde 200 com status ok", async () => {
    const res = await t.app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  describe("agenda", () => {
    it("GET /v1/schedules devolve a agenda vazia e a versão 1", async () => {
      const res = await t.app.inject({ method: "GET", url: "/v1/schedules" });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ versao: 1, agenda: [] });
    });

    it("PUT /v1/schedules válido devolve a versão nova e a agenda em ordem de horário", async () => {
      const res = await t.app.inject({
        method: "PUT",
        url: "/v1/schedules",
        payload: [jantar, cafe],
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ versao: 2, agenda: [cafe, jantar] });
    });

    it("PUT com porcoes: 'dois' devolve 400 (forma errada)", async () => {
      const res = await t.app.inject({
        method: "PUT",
        url: "/v1/schedules",
        payload: [{ hora: "07:30", porcoes: "dois" }],
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().motivo).toBe("requisicao_invalida");
    });

    it("PUT com 9 refeições devolve 422 e o motivo agenda_cheia (regra do domínio)", async () => {
      const nove = Array.from({ length: 9 }, (_, i) => ({
        hora: `0${i}:00`,
        porcoes: 1,
        ativo: true,
      }));

      const res = await t.app.inject({
        method: "PUT",
        url: "/v1/schedules",
        payload: nove,
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().motivo).toBe("agenda_cheia");
    });

    it("uma agenda recusada não é salva", async () => {
      await t.app.inject({
        method: "PUT",
        url: "/v1/schedules",
        payload: [cafe, cafe],
      });

      const res = await t.app.inject({ method: "GET", url: "/v1/schedules" });
      expect(res.json()).toEqual({ versao: 1, agenda: [] });
    });
  });

  describe("configuração", () => {
    it("GET /v1/config devolve a configuração padrão e os fusos aceitos", async () => {
      const res = await t.app.inject({ method: "GET", url: "/v1/config" });

      expect(res.statusCode).toBe(200);
      expect(res.json().config.limiteDiarioPorcoes).toBe(10);
      expect(res.json().fusos).toContain("America/Sao_Paulo");
    });

    it("PUT /v1/config válido sobe a versão e chega ao dispositivo", async () => {
      const { config } = (
        await t.app.inject({ method: "GET", url: "/v1/config" })
      ).json();

      const res = await t.app.inject({
        method: "PUT",
        url: "/v1/config",
        payload: { ...config, limiteDiarioPorcoes: 12 },
      });
      await t.device.settled();

      expect(res.statusCode).toBe(200);
      expect(res.json().versao).toBe(2);
      expect(t.simulated.state().configVersion).toBe(2);
    });

    it("PUT que baixa o limite para menos que a agenda devolve 422 (agenda_acima_do_limite)", async () => {
      await t.app.inject({
        method: "PUT",
        url: "/v1/schedules",
        payload: [cafe, jantar],
      });
      const { config } = (
        await t.app.inject({ method: "GET", url: "/v1/config" })
      ).json();

      const res = await t.app.inject({
        method: "PUT",
        url: "/v1/config",
        payload: { ...config, limiteDiarioPorcoes: 4 },
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().motivo).toBe("agenda_acima_do_limite");
    });

    it("PUT sem um campo devolve 400", async () => {
      const res = await t.app.inject({
        method: "PUT",
        url: "/v1/config",
        payload: { limiteDiarioPorcoes: 12 },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("servir agora", () => {
    const feed = (payload: object = {}) =>
      t.app.inject({ method: "POST", url: "/v1/feed", payload });

    it("aceito devolve 202 e a refeição aparece no histórico e no status", async () => {
      const res = await feed({ porcoes: 2 });
      await t.device.settled();

      expect(res.statusCode).toBe(202);

      const history = (
        await t.app.inject({ method: "GET", url: "/v1/history" })
      ).json();
      expect(history[0]).toMatchObject({
        tipo: "refeicao_servida",
        porcoes: 2,
        gramas: 12,
        origem: "interface",
      });

      const status = (
        await t.app.inject({ method: "GET", url: "/v1/status" })
      ).json();
      expect(status.hoje).toEqual({ porcoes: 2, gramas: 12 });
      expect(status.ultimaRefeicao.porcoes).toBe(2);
    });

    it("um pedido 10 min depois de outro devolve 429 com o motivo intervalo", async () => {
      await feed();
      await t.advance(10);

      const res = await feed();

      expect(res.statusCode).toBe(429);
      expect(res.json()).toEqual({ motivo: "intervalo" });
    });

    it("passar do limite diário devolve 429 com o motivo limite_diario", async () => {
      await feed({ porcoes: 8 });
      await t.advance(40);

      const res = await feed({ porcoes: 3 });

      expect(res.statusCode).toBe(429);
      expect(res.json()).toEqual({ motivo: "limite_diario" });
    });

    it("com ração na tigela devolve 429 (tigela_com_racao), e o forcar passa", async () => {
      t.simulated.setBowlGrams(30);

      const recusado = await feed();
      expect(recusado.statusCode).toBe(429);
      expect(recusado.json()).toEqual({ motivo: "tigela_com_racao" });

      const forcado = await feed({ forcar: true });
      expect(forcado.statusCode).toBe(202);
    });

    it("o forcar não fura o intervalo", async () => {
      await feed();
      await t.advance(10);

      const res = await feed({ forcar: true });

      expect(res.statusCode).toBe(429);
      expect(res.json()).toEqual({ motivo: "intervalo" });
    });

    it("enquanto serve devolve 409", async () => {
      await feed();

      const res = await feed();

      expect(res.statusCode).toBe(409);
    });

    it("11 porções devolve 422 (porcoes_invalidas)", async () => {
      const res = await feed({ porcoes: 11 });

      expect(res.statusCode).toBe(422);
      expect(res.json().motivo).toBe("porcoes_invalidas");
    });
  });

  describe("histórico e status", () => {
    it("GET /v1/history com limit acima de 200 devolve 400", async () => {
      const res = await t.app.inject({
        method: "GET",
        url: "/v1/history?limit=500",
      });

      expect(res.statusCode).toBe(400);
    });

    it("o histórico vem do mais recente para o mais antigo", async () => {
      await t.app.inject({ method: "POST", url: "/v1/feed", payload: {} });
      await t.advance(40);
      await t.app.inject({ method: "POST", url: "/v1/feed", payload: {} });
      await t.device.settled();

      const history = (
        await t.app.inject({ method: "GET", url: "/v1/history?limit=2" })
      ).json();

      expect(history).toHaveLength(2);
      expect(history[0].hora > history[1].hora).toBe(true);
    });

    it("o status mostra a próxima refeição ativa: a de hoje ou, se já passou, a primeira de amanhã", async () => {
      const status = async () =>
        (await t.app.inject({ method: "GET", url: "/v1/status" })).json();
      expect((await status()).proximaRefeicao).toBeNull();

      // São 12:00. O almoço das 12:10 está desativado, então a próxima é o jantar.
      await t.app.inject({
        method: "PUT",
        url: "/v1/schedules",
        payload: [cafe, { hora: "12:10", porcoes: 1, ativo: false }, jantar],
      });
      expect((await status()).proximaRefeicao).toEqual({
        hora: "18:00",
        porcoes: 3,
        amanha: false,
      });

      // Às 19:00, a próxima é o café de amanhã.
      t.clock.advanceMinutes(7 * 60);
      expect((await status()).proximaRefeicao).toEqual({
        hora: "07:30",
        porcoes: 2,
        amanha: true,
      });
    });

    it("o status mostra o dispositivo online, sincronizado e simulado", async () => {
      const status = (
        await t.app.inject({ method: "GET", url: "/v1/status" })
      ).json();

      expect(status.online).toBe(true);
      expect(status.simulado).toBe(true);
      expect(status.config).toEqual({
        versao: 1,
        versaoAplicada: 1,
        sincronizado: true,
      });
      expect(status.garrafa.percentual).toBe(100);
    });

    it("o 'hoje' usa o fuso da configuração: 22:30 de Brasília conta no dia certo", async () => {
      // 22:30 em Brasília do dia 10 já é 01:30 UTC do dia 11.
      t.clock.set(new Date("2026-11-11T01:30:00.000Z"));
      await t.app.inject({ method: "POST", url: "/v1/feed", payload: {} });
      await t.device.settled();

      // Ainda dia 10 em Brasília: a refeição conta.
      t.clock.set(new Date("2026-11-11T02:30:00.000Z"));
      const antes = (
        await t.app.inject({ method: "GET", url: "/v1/status" })
      ).json();
      expect(antes.hoje.porcoes).toBe(1);

      // 00:30 do dia 11 em Brasília: virou o dia, não conta mais.
      t.clock.set(new Date("2026-11-11T03:30:00.000Z"));
      const depois = (
        await t.app.inject({ method: "GET", url: "/v1/status" })
      ).json();
      expect(depois.hoje.porcoes).toBe(0);
    });
  });

  describe("erros", () => {
    it("rota desconhecida em /v1 devolve 404 em JSON", async () => {
      const res = await t.app.inject({ method: "GET", url: "/v1/nada" });

      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ motivo: "nao_encontrado" });
    });

    it("um erro inesperado vira 500 com mensagem genérica, sem detalhe no corpo", async () => {
      t.feederRepository.load = async () => {
        throw new Error("senha do banco: 123456");
      };

      const res = await t.app.inject({ method: "GET", url: "/v1/schedules" });

      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ motivo: "erro_interno" });
      expect(res.body).not.toContain("123456");
    });
  });
});
