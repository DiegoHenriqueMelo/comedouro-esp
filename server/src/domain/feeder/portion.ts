import { ErroDeDominio } from "../shared/erro-de-dominio.js";

// Quantidade de porções de uma refeição agendada (regra R4 do glossário).
export class Portion {
  static readonly MIN = 1;
  static readonly MAX = 10;

  readonly value: number;

  // Privado: ninguém de fora faz `new Porcoes(...)`. O único jeito de criar é o `criar`, que valida.
  private constructor(valor: number) {
    this.value = valor;
  }

  static create(valor: number): Portion {
    const isInt = Number.isInteger(valor);
    const valueIsValid = valor >= Portion.MIN && valor <= Portion.MAX;

    if (!isInt || !valueIsValid) {
      throw new ErroDeDominio(
        "porcoes_invalidas",
        `Porções devem ser um número inteiro de ${Portion.MIN} a ${Portion.MAX}; recebido: ${valor}`,
      );
    }

    return new Portion(valor);
  }

  equal(outra: Portion): boolean {
    return this.value === outra.value;
  }
}
