import { describe, expect, it } from "vitest";
import { ErroDeDominio } from "../shared/erro-de-dominio.js";
import { Configuration } from "./configuration.js";
import { Feeder } from "./feeder.js";
import { Portion } from "./portion.js";
import { ScheduledMeal } from "./scheduled-meal.js";
import { Timing } from "./timing.js";

const cafe = ScheduledMeal.create(Timing.create("07:30"), Portion.create(1));

describe("Feeder: eventos e restauração", () => {
  it("toda mudança aceita registra o evento ConfiguracaoAlterada com a versão nova", () => {
    const feeder = Feeder.create();

    feeder.replaceSchedule([cafe]);

    expect(feeder.pullEvents()).toEqual([
      { type: "ConfiguracaoAlterada", version: 2 },
    ]);
    expect(feeder.pullEvents()).toEqual([]); // entregou, esvaziou
  });

  it("uma mudança recusada não registra evento", () => {
    const feeder = Feeder.create();

    expect(() => feeder.replaceSchedule([cafe, cafe])).toThrow(ErroDeDominio);
    expect(feeder.pullEvents()).toEqual([]);
  });

  it("restore recria o alimentador com a versão salva", () => {
    const feeder = Feeder.restore([cafe], Configuration.default(), 7);

    expect(feeder.version).toBe(7);
    expect(feeder.schedule).toEqual([cafe]);
    expect(feeder.pullEvents()).toEqual([]);
  });

  it("restore recusa dado inválido", () => {
    expect(() =>
      Feeder.restore([cafe, cafe], Configuration.default(), 7),
    ).toThrow(expect.objectContaining({ codigo: "horario_repetido" }));
  });
});
