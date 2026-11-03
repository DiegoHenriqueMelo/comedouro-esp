import { describe, expect, it } from "vitest";
import { ErroDeDominio } from "../shared/erro-de-dominio.js";
import { Feeder } from "./feeder.js";
import { Portion } from "./portion.js";
import { ScheduledMeal } from "./scheduled-meal.js";
import { Timing } from "./timing.js";

// Atalho para os testes: meal("07:30") cria uma refeição ativa com 1 porção.
function meal(hora: string, porcoes = 1, ativa = true): ScheduledMeal {
  return ScheduledMeal.create(
    Timing.create(hora),
    Portion.create(porcoes),
    ativa,
  );
}

// Uma refeição por hora, a partir de 00:00: mealsOnTheHour(3) → 00:00, 01:00, 02:00.
// Com 1 porção cada e 1 h de distância, a agenda é válida em todas as outras regras,
// e o teste só falha pelo motivo que ele está testando.
function mealsOnTheHour(quantidade: number): ScheduledMeal[] {
  return Array.from({ length: quantidade }, (_, i) =>
    meal(`${String(i).padStart(2, "0")}:00`),
  );
}

describe("Feeder", () => {
  it("um alimentador novo nasce com a configuração padrão e versão 1", () => {
    // prepara + age
    const feeder = Feeder.create();

    // confere
    expect(feeder.version).toBe(1);
    expect(feeder.schedule).toEqual([]);
    expect(feeder.configuration).toEqual({
      gramsPerPortion: 6,
      dailyLimitPortions: 10,
      minIntervalMinutes: 30,
      bowlLimitGrams: 10,
      timeZone: "America/Sao_Paulo",
      bottleHeightMm: 230,
      fillAngle: 0,
      serveAngle: 60,
    });
  });

  it("trocar a agenda por uma válida sobe a versão em 1", () => {
    // prepara
    const feeder = Feeder.create();
    const cafe = ScheduledMeal.create(
      Timing.create("07:30"),
      Portion.create(2),
      true,
    );

    // age
    feeder.replaceSchedule([cafe]);

    // confere
    expect(feeder.version).toBe(2);
    expect(feeder.schedule).toEqual([cafe]);
  });

  it("mexer na lista devolvida não muda a agenda", () => {
    const feeder = Feeder.create();

    feeder.schedule.push(meal("07:30")); // mexe na cópia

    expect(feeder.schedule).toEqual([]); // a agenda de verdade continua vazia
  });

  describe("R1: no máximo 8 refeições", () => {
    it("aceita uma agenda com 8 refeições, o máximo", () => {
      const feeder = Feeder.create();

      feeder.replaceSchedule(mealsOnTheHour(8));

      expect(feeder.schedule).toHaveLength(8);
    });

    it("recusa uma agenda com 9 refeições com o código agenda_cheia", () => {
      const feeder = Feeder.create();

      expect(() => feeder.replaceSchedule(mealsOnTheHour(9))).toThrow(
        ErroDeDominio,
      );
      expect(() => feeder.replaceSchedule(mealsOnTheHour(9))).toThrow(
        expect.objectContaining({ codigo: "agenda_cheia" }),
      );
    });

    it("uma mudança recusada não altera nada: nem a agenda, nem a versão", () => {
      // prepara: um alimentador que já tem uma agenda válida, na versão 2
      const feeder = Feeder.create();
      feeder.replaceSchedule([meal("07:30")]);

      // age: tenta trocar por uma agenda inválida
      expect(() => feeder.replaceSchedule(mealsOnTheHour(9))).toThrow(
        ErroDeDominio,
      );

      // confere: tudo como estava antes da tentativa
      expect(feeder.schedule).toEqual([meal("07:30")]);
      expect(feeder.version).toBe(2);
    });
  });

  describe("R2: Sem horario repetido", () => {
    it("recusa duas refeições às 07:30 com o código horario_repetido", () => {
      const feeder = Feeder.create();

      const agenda = [meal("07:30"), meal("07:30", 2)];

      expect(() => feeder.replaceSchedule(agenda)).toThrow(
        expect.objectContaining({ codigo: "horario_repetido" }),
      );
    });

    it("recusa mesmo quando uma delas está desativada", () => {
      const feeder = Feeder.create();

      const agenda = [meal("07:30", 1, true), meal("07:30", 2, false)];

      expect(() => feeder.replaceSchedule(agenda)).toThrow(
        expect.objectContaining({ codigo: "horario_repetido" }),
      );
    });
  });

  describe("R5: a agenda não passa do limite diario", () => {
    it("aceita uma agenda que soma exatamente o limite", () => {
      const feeder = Feeder.create();

      const agenda = [meal("07:30", 5), meal("19:30", 5)];

      feeder.replaceSchedule(agenda);

      expect(feeder.schedule).toHaveLength(2);
    });

    it("recusa uma agenda acima do limite com o código agenda_acima_do_limite", () => {
      const feeder = Feeder.create();

      const agenda = [meal("07:30", 5), meal("19:30", 6)];

      expect(() => feeder.replaceSchedule(agenda)).toThrow(
        expect.objectContaining({ codigo: "agenda_acima_do_limite" }),
      );
    });
    it("refeição desativada não entra na soma", () => {
      const feeder = Feeder.create();

      const agenda = [meal("07:30", 5, true), meal("19:30", 6, false)];

      feeder.replaceSchedule(agenda);
      expect(feeder.schedule).toHaveLength(2);
    });
  });

  // O intervalo mínimo padrão é de 30 min.
  describe("R6: refeições ativas separadas pelo intervalo mínimo", () => {
    it("aceita duas refeições a exatamente 30 min, o mínimo", () => {
      const feeder = Feeder.create();

      feeder.replaceSchedule([meal("07:30"), meal("08:00")]);

      expect(feeder.schedule).toHaveLength(2);
    });

    it("recusa duas refeições a 29 min com o código horarios_muito_proximos", () => {
      const feeder = Feeder.create();

      const agenda = [meal("07:30"), meal("07:59")];

      expect(() => feeder.replaceSchedule(agenda)).toThrow(
        expect.objectContaining({ codigo: "horarios_muito_proximos" }),
      );
    });

    it("recusa 23:50 e 00:10, que estão a 20 min passando pela meia-noite", () => {
      const feeder = Feeder.create();

      const agenda = [meal("23:50"), meal("00:10")];

      expect(() => feeder.replaceSchedule(agenda)).toThrow(
        expect.objectContaining({ codigo: "horarios_muito_proximos" }),
      );
    });

    it("confere todos os pares, não só os vizinhos na lista", () => {
      const feeder = Feeder.create();

      // 07:30 e 07:50 estão a 20 min, com o 12:00 entre eles na lista
      const agenda = [meal("07:30"), meal("12:00"), meal("07:50")];

      expect(() => feeder.replaceSchedule(agenda)).toThrow(
        expect.objectContaining({ codigo: "horarios_muito_proximos" }),
      );
    });

    it("refeição desativada não conta na distância", () => {
      const feeder = Feeder.create();

      const agenda = [meal("07:30"), meal("07:45", 1, false)];

      feeder.replaceSchedule(agenda);
      expect(feeder.schedule).toHaveLength(2);
    });
  });
});
