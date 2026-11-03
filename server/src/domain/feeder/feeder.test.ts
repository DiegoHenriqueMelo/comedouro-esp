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
});
