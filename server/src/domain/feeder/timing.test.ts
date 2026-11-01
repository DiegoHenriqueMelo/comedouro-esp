import { describe, expect, it } from "vitest";
import { ErroDeDominio } from "../shared/erro-de-dominio.js";
import { Timing } from "./timing.js";

describe("Timing", () => {
  describe("create: a partir do texto HH:MM", () => {
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
  });

  describe("toSchedule: horários válidos", () => {
    it("guarda a hora e o minuto recebidos", () => {
      // prepara + age
      const horario = Timing.toSchedule(7, 30);

      // confere, campo a campo
      expect(horario.hour).toBe(7);
      expect(horario.minute).toBe(30);
    });

    // Fronteiras da R3: o primeiro e o último valor válido, e um do meio.
    // Cada linha da lista vira um teste; cada %i do título é trocado por um número da linha.
    it.each([
      [0, 0],
      [12, 30],
      [23, 59],
    ])("aceita %i h %i min", (hora, minuto) => {
      // toEqual compara o conteúdo; toBe compararia a referência e falharia
      expect(Timing.toSchedule(hora, minuto)).toEqual({
        hour: hora,
        minute: minuto,
      });
    });

    it("dois horários iguais têm o mesmo conteúdo, mas são objetos diferentes", () => {
      const a = Timing.toSchedule(7, 30);
      const b = Timing.toSchedule(7, 30);

      expect(a).toEqual(b); // mesmo conteúdo
      expect(a).not.toBe(b); // o .not inverte o matcher: não é o mesmo objeto na memória
    });
  });

  describe("toSchedule: horários inválidos", () => {
    // Fronteiras da R3: o vizinho de fora de cada limite, mais os valores que não são inteiros.
    // Na forma com objetos, cada $campo do título é trocado pelo valor daquele campo.
    it.each([
      { hora: -1, minuto: 0, motivo: "hora abaixo de 0" },
      { hora: 24, minuto: 0, motivo: "hora acima de 23" },
      { hora: 12, minuto: -1, motivo: "minuto abaixo de 0" },
      { hora: 12, minuto: 60, motivo: "minuto acima de 59" },
      { hora: 7.5, minuto: 0, motivo: "hora com decimal" },
      { hora: 12, minuto: 30.5, motivo: "minuto com decimal" },
      { hora: Number.NaN, minuto: 0, motivo: "hora que não é número" },
    ])("recusa $hora h $minuto min ($motivo)", ({ hora, minuto }) => {
      // a seta entrega a função sem executar; o expect chama e segura o erro
      expect(() => Timing.toSchedule(hora, minuto)).toThrow(ErroDeDominio);
      expect(() => Timing.toSchedule(hora, minuto)).toThrow(
        expect.objectContaining({ codigo: "horario_invalido" }),
      );
    });

    it("a mensagem do erro mostra o valor recebido", () => {
      // com uma regex, o toThrow confere o texto da mensagem
      expect(() => Timing.toSchedule(24, 0)).toThrow(/24/);
    });
  });

  describe("comparações", () => {
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
});
