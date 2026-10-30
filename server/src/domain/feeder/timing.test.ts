import { describe, expect, it } from "vitest";
import { ErroDeDominio } from "../shared/erro-de-dominio.js";
import { Timing } from "./timing.js";

describe("Timing", () => {
  it('cria a partir de "07:30" e devolve "07:30" no toString', () => {
    // prepara + age
    const horario = Timing.create("07:30");

    // confere
    expect(horario.toString()).toBe("07:30");
  });

  it('aceita os extremos "00:00" e "23:59"', () => {
    expect(Timing.create("00:00").toString()).toBe("00:00");
    expect(Timing.create("23:59").toString()).toBe("23:59");
  });

  it.each(["7:30", "24:00", "12:60", "", "abc"])(
    'recusa "%s" com o código horario_invalido',
    (texto) => {
      expect(() => Timing.create(texto)).toThrow(ErroDeDominio);
      expect(() => Timing.create(texto)).toThrow(
        expect.objectContaining({ codigo: "horario_invalido" }),
      );
    },
  );

  it('"07:30" são 450 minutos do dia', () => {
    expect(Timing.create("07:30").minutesOfDay()).toBe(450);
  });

  it("dois horários com o mesmo valor são iguais", () => {
    const a = Timing.create("07:30");

    expect(a.equal(Timing.create("07:30"))).toBe(true);
    expect(a.equal(Timing.create("12:00"))).toBe(false);
  });

  it('"07:30" vem antes de "12:00"', () => {
    const cedo = Timing.create("07:30");
    const tarde = Timing.create("12:00");

    expect(cedo.isBefore(tarde)).toBe(true);
    expect(tarde.isBefore(cedo)).toBe(false);
  });

  it("a distância entre 07:30 e 08:00 é de 30 minutos", () => {
    const a = Timing.create("07:30");
    const b = Timing.create("08:00");

    expect(a.distanceInMinutes(b)).toBe(30);
  });

  it("a distância entre 23:50 e 00:10 é de 20 minutos, passando pela meia-noite", () => {
    const antes = Timing.create("23:50");
    const depois = Timing.create("00:10");

    expect(antes.distanceInMinutes(depois)).toBe(20);
    expect(depois.distanceInMinutes(antes)).toBe(20); // a ordem não importa
  });
});
