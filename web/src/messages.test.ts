import { describe, expect, it } from "vitest";
import { ApiError, type HistoryItem, type Status } from "./api";
import {
  activePortions,
  canForce,
  formatDay,
  formatGrams,
  historyLine,
  messageFor,
  needsAcknowledge,
} from "./messages";

const status = (changes: Partial<Status>) => changes as Status;

describe("messageFor: cada motivo vira uma frase clara", () => {
  it.each([
    ["limite_diario", "Limite de hoje atingido."],
    ["alimentador_offline", "O alimentador está offline."],
    ["agenda_cheia", "A agenda aceita no máximo 8 refeições."],
    ["sem_conexao", "Sem conexão com o servidor."],
  ])("%s", (motivo, frase) => {
    expect(messageFor(new ApiError(429, motivo))).toBe(frase);
  });

  it("tigela_com_racao mostra quantos gramas a tigela tem", () => {
    const error = new ApiError(429, "tigela_com_racao");

    expect(
      messageFor(error, status({ tigela: { gramas: 12, estavel: true } })),
    ).toBe("A tigela ainda tem 12 g.");
    expect(messageFor(error, null)).toBe("A tigela ainda tem ração.");
  });

  it("ocupado com o alimentador em VAZIO explica o que fazer", () => {
    const message = messageFor(
      new ApiError(409, "ocupado"),
      status({ estado: "vazio" }),
    );

    expect(message).toContain("a última porção não saiu");
  });

  it("um motivo desconhecido ou um erro qualquer vira a mensagem genérica", () => {
    const generic = "Algo deu errado no servidor. Tente de novo.";

    expect(messageFor(new ApiError(500, "motivo_novo"))).toBe(generic);
    expect(messageFor(new Error("boom"))).toBe(generic);
  });
});

describe("canForce", () => {
  it("só a recusa pela tigela pode ser forçada", () => {
    expect(canForce(new ApiError(429, "tigela_com_racao"))).toBe(true);
    expect(canForce(new ApiError(429, "limite_diario"))).toBe(false);
    expect(canForce(new ApiError(429, "intervalo"))).toBe(false);
    expect(canForce(null)).toBe(false);
  });
});

describe("historyLine", () => {
  const item = (changes: Partial<HistoryItem>): HistoryItem => ({
    seq: 1,
    tipo: "refeicao_servida",
    hora: "2026-11-10T15:00:00.000Z",
    porcoes: null,
    gramas: null,
    origem: null,
    motivo: null,
    ...changes,
  });

  it("refeição servida mostra porções, gramas e origem", () => {
    expect(
      historyLine(item({ porcoes: 2, gramas: 12.4, origem: "interface" })),
    ).toEqual({
      title: "Refeição servida",
      detail: "2 porções · 12,4 g · app",
      tone: "ok",
    });
  });

  it("uma porção fica no singular", () => {
    expect(historyLine(item({ porcoes: 1 })).detail).toBe("1 porção");
  });

  it("pedido recusado mostra o motivo em palavras", () => {
    const line = historyLine(
      item({
        tipo: "refeicao_recusada",
        motivo: "limite_diario",
        porcoes: 3,
        origem: "alexa",
      }),
    );

    expect(line.title).toBe("Pedido recusado");
    expect(line.detail).toBe("limite diário · 3 porções · Alexa");
  });

  it("um tipo desconhecido aparece sem quebrar a tela", () => {
    expect(historyLine(item({ tipo: "tipo_novo" })).title).toBe("tipo_novo");
  });
});

describe("apoio", () => {
  it("needsAcknowledge: só os alertas que não se resolvem sozinhos", () => {
    expect(needsAcknowledge("reiniciou")).toBe(true);
    expect(needsAcknowledge("porcao_nao_saiu")).toBe(true);
    expect(needsAcknowledge("garrafa_baixa")).toBe(false);
    expect(needsAcknowledge("offline")).toBe(false);
  });

  it("formatGrams arredonda para uma casa e usa vírgula", () => {
    expect(formatGrams(12)).toBe("12 g");
    expect(formatGrams(6.25)).toBe("6,3 g");
  });

  it("formatDay diz hoje, ontem ou a data", () => {
    const now = new Date(2026, 10, 10, 12, 0);

    expect(formatDay(new Date(2026, 10, 10, 8, 0).toISOString(), now)).toBe(
      "Hoje",
    );
    expect(formatDay(new Date(2026, 10, 9, 23, 0).toISOString(), now)).toBe(
      "Ontem",
    );
    expect(formatDay(new Date(2026, 10, 5, 8, 0).toISOString(), now)).toContain(
      "5",
    );
  });

  it("activePortions soma só as refeições ativas", () => {
    expect(
      activePortions([
        { porcoes: 2, ativo: true },
        { porcoes: 5, ativo: false },
        { porcoes: 3, ativo: true },
      ]),
    ).toBe(5);
  });
});
