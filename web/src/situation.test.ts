import { describe, expect, it } from "vitest";
import { ApiError, type Status } from "./api";
import { alertTone, fieldFor, situation, toneFor } from "./messages";

// 10/11/2026, 14:00, no fuso do computador que roda o teste.
const now = new Date(2026, 10, 10, 14, 0);
const at = (day: number, hour: number, minute: number) =>
  new Date(2026, 10, day, hour, minute).toISOString();

const status = (changes: Partial<Status> = {}): Status =>
  ({
    nomeDoGato: "Mingau",
    online: true,
    onlineDesde: at(10, 8, 0),
    estado: "ocioso",
    ultimaRefeicao: {
      hora: at(10, 12, 30),
      porcoes: 2,
      gramas: 12,
      origem: "agenda",
    },
    proximaRefeicao: { hora: "18:00", porcoes: 3, amanha: false },
    ...changes,
  }) as Status;

describe("situation: a frase do topo da tela inicial", () => {
  it("com tudo bem, diz quando o gato comeu e quando é a próxima refeição", () => {
    expect(situation(status(), now)).toBe(
      "Mingau comeu às 12:30. Próxima refeição às 18:00.",
    );
  });

  it("sem nome configurado, fala em 'Seu gato'", () => {
    expect(situation(status({ nomeDoGato: "  " }), now)).toBe(
      "Seu gato comeu às 12:30. Próxima refeição às 18:00.",
    );
  });

  it("diz 'ontem' e 'amanhã' quando a refeição não é de hoje", () => {
    const text = situation(
      status({
        ultimaRefeicao: {
          hora: at(9, 18, 0),
          porcoes: 3,
          gramas: 18,
          origem: "agenda",
        },
        proximaRefeicao: { hora: "07:30", porcoes: 2, amanha: true },
      }),
      now,
    );

    expect(text).toBe(
      "Mingau comeu ontem às 18:00. Próxima refeição amanhã às 07:30.",
    );
  });

  it("uma refeição de dias atrás aparece com a data", () => {
    const text = situation(
      status({
        ultimaRefeicao: {
          hora: at(5, 18, 0),
          porcoes: 3,
          gramas: 18,
          origem: "agenda",
        },
      }),
      now,
    );

    expect(text).toContain("Mingau comeu em 05/11, às 18:00.");
  });

  it("sem nenhuma refeição e sem agenda, diz as duas coisas", () => {
    expect(
      situation(status({ ultimaRefeicao: null, proximaRefeicao: null }), now),
    ).toBe(
      "Nenhuma refeição registrada ainda. Nenhuma refeição ativa na agenda.",
    );
  });

  it("offline: a frase começa pelo problema e não promete a próxima refeição", () => {
    const text = situation(
      status({ online: false, onlineDesde: at(10, 13, 20) }),
      now,
    );

    expect(text).toBe(
      "Sem contato com o comedouro desde as 13:20. Mingau comeu às 12:30.",
    );
  });

  it("offline desde ontem, e offline sem nunca ter conectado", () => {
    expect(
      situation(status({ online: false, onlineDesde: at(9, 22, 0) }), now),
    ).toContain("Sem contato com o comedouro desde ontem às 22:00.");
    expect(
      situation(
        status({ online: false, onlineDesde: null, ultimaRefeicao: null }),
        now,
      ),
    ).toBe("Sem contato com o comedouro.");
  });

  it("com a porção que não saiu, a frase começa pelo problema", () => {
    expect(situation(status({ estado: "vazio" }), now)).toBe(
      "A última porção não saiu. Mingau comeu às 12:30.",
    );
  });
});

describe("toneFor: recusa é aviso, falha é problema", () => {
  it.each([
    [429, "limite_diario", "warn"],
    [409, "ocupado", "warn"],
    [422, "agenda_cheia", "warn"],
    [400, "requisicao_invalida", "warn"],
    [503, "alimentador_offline", "bad"],
    [500, "erro_interno", "bad"],
    [0, "sem_conexao", "bad"],
  ])("status %i (%s) é %s", (code, motivo, tone) => {
    expect(toneFor(new ApiError(code, motivo))).toBe(tone);
  });

  it("um erro que não veio da API é problema", () => {
    expect(toneFor(new Error("boom"))).toBe("bad");
  });
});

describe("fieldFor: o campo dos Ajustes que causou o erro", () => {
  it("leva cada regra ao campo certo", () => {
    expect(fieldFor(new ApiError(422, "nome_do_gato_invalido"))).toBe(
      "nomeDoGato",
    );
    expect(fieldFor(new ApiError(422, "agenda_acima_do_limite"))).toBe(
      "limiteDiarioPorcoes",
    );
    expect(fieldFor(new ApiError(422, "horarios_muito_proximos"))).toBe(
      "intervaloMinimoMin",
    );
    expect(fieldFor(new ApiError(422, "angulos_invalidos"))).toBe(
      "anguloServir",
    );
  });

  it("um erro sem dono não aponta campo nenhum", () => {
    expect(fieldFor(new ApiError(0, "sem_conexao"))).toBeNull();
    expect(fieldFor(new Error("boom"))).toBeNull();
  });
});

describe("alertTone", () => {
  it("ração acabando, refeição pulada e reinício são avisos; o resto é problema", () => {
    expect(alertTone("garrafa_baixa")).toBe("warn");
    expect(alertTone("refeicao_pulada")).toBe("warn");
    expect(alertTone("reiniciou")).toBe("warn");
    expect(alertTone("porcao_nao_saiu")).toBe("bad");
    expect(alertTone("sensor_sem_leitura")).toBe("bad");
    expect(alertTone("offline")).toBe("bad");
  });
});
