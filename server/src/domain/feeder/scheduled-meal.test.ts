import { describe, expect, it } from "vitest";
import { Portion } from "./portion.js";
import { ScheduledMeal } from "./scheduled-meal.js";
import { Timing } from "./timing.js";

describe("Scheduled Meal", () => {
  it("guarda que a refeição está ativa", () => {
    const meal = ScheduledMeal.create(
      Timing.create("07:30"),
      Portion.create(1),
      true,
    );
    expect(meal.active).toBe(true);
  });

  it("Guarda que a refeiçã está desativada", () => {
    const meal = ScheduledMeal.create(
      Timing.create("07:30"),
      Portion.create(1),
      false,
    );
    expect(meal.active).toBe(false);
  });

  it("Sem dizer nada, a refeição nasce como ativa", () => {
    const meal = ScheduledMeal.create(
      Timing.create("07:30"),
      Portion.create(1),
    );
    expect(meal.active).toBe(true);
  });
});
