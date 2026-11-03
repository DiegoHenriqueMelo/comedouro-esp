import { describe, expect, it } from "vitest";
import { Feeder } from "./feeder.js";
import { Portion } from "./portion.js";
import { ScheduledMeal } from "./scheduled-meal.js";
import { Timing } from "./timing.js";

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
});
