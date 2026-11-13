import { describe, expect, it } from "vitest";
import { Configuration, type ConfigurationProps } from "./configuration.js";

function props(campos: Partial<ConfigurationProps>): ConfigurationProps {
  return { ...Configuration.default(), ...campos };
}

describe("Configuration", () => {
  it("a configuração padrão é válida", () => {
    expect(Configuration.default().dailyLimitPortions).toBe(10);
  });

  it.each([
    { campos: { gramsPerPortion: 0 }, codigo: "gramas_por_porcao_invalido" },
    { campos: { gramsPerPortion: 50 }, codigo: "gramas_por_porcao_invalido" },
    {
      campos: { gramsPerPortion: Number.NaN },
      codigo: "gramas_por_porcao_invalido",
    },
    { campos: { dailyLimitPortions: 0 }, codigo: "limite_diario_invalido" },
    { campos: { dailyLimitPortions: 31 }, codigo: "limite_diario_invalido" },
    { campos: { dailyLimitPortions: 2.5 }, codigo: "limite_diario_invalido" },
    { campos: { minIntervalMinutes: 5 }, codigo: "intervalo_minimo_invalido" },
    {
      campos: { minIntervalMinutes: 1000 },
      codigo: "intervalo_minimo_invalido",
    },
    { campos: { bowlLimitGrams: -1 }, codigo: "limite_tigela_invalido" },
    { campos: { bowlLimitGrams: 500 }, codigo: "limite_tigela_invalido" },
    { campos: { timeZone: "Europe/Lisbon" }, codigo: "fuso_invalido" },
    { campos: { bottleHeightMm: 10 }, codigo: "altura_garrafa_invalida" },
    { campos: { serveAngle: 200 }, codigo: "angulos_invalidos" },
    { campos: { fillAngle: 60, serveAngle: 60 }, codigo: "angulos_invalidos" },
  ])("recusa $campos com o código $codigo", ({ campos, codigo }) => {
    expect(() => Configuration.create(props(campos))).toThrow(
      expect.objectContaining({ codigo }),
    );
  });

  it("aceita os extremos de cada faixa", () => {
    const c = Configuration.create(
      props({
        gramsPerPortion: 30,
        dailyLimitPortions: 30,
        minIntervalMinutes: 15,
        bowlLimitGrams: 0,
        fillAngle: 180,
        serveAngle: 0,
        timeZone: "America/Manaus",
      }),
    );
    expect(c.timeZone).toBe("America/Manaus");
  });
});
