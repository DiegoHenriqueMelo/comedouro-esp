import { describe, expect, it } from "vitest";
import { ErroDeDominio } from "../shared/erro-de-dominio.js";
import { Portion } from "./portion.js";

describe("Portion", () => {
  it("aceita de 1 a 10", () => {
    expect(Portion.create(1).value).toBe(1);
    expect(Portion.create(10).value).toBe(10);
  });

  it.each([0, -1, 11, 1.5])(
    "recusa %s com o código porcoes_invalidas",
    (valor) => {
      expect(() => Portion.create(valor)).toThrow(ErroDeDominio);
      expect(() => Portion.create(valor)).toThrow(
        expect.objectContaining({ codigo: "porcoes_invalidas" }),
      );
    },
  );

  it("duas porções com o mesmo valor são iguais", () => {
    const a = Portion.create(2);
    const b = Portion.create(2);

    expect(a === b).toBe(false); // são dois objetos diferentes na memória...
    expect(a.equal(b)).toBe(true); // ...mas o mesmo valor
    expect(a.equal(Portion.create(3))).toBe(false);
  });
});
