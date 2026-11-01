import { ErroDeDominio } from "../shared/erro-de-dominio.js";

// Hora do dia, sem data, no formato HH:MM (regra R3 do glossário).
export class Timing {
  static readonly HOUR_MIN = 0;
  static readonly HOUR_MAX = 23;
  static readonly MINUTE_MIN = 0;
  static readonly MINUTE_MAX = 59;
  static readonly MINUTES_PER_DAY = 24 * 60;

  readonly hour: number;
  readonly minute: number;

  private constructor(hour: number, minute: number) {
    this.hour = hour;
    this.minute = minute;
  }

  // Lê o texto em três passos: confere a forma, converte e deixa o `toSchedule` conferir a faixa.
  static create(texto: string): Timing {
    // Exatamente dois dígitos, dois-pontos e dois dígitos: "7:30" e "" param aqui.
    if (!/^\d{2}:\d{2}$/.test(texto)) {
      throw new ErroDeDominio(
        "horario_invalido",
        `Horário deve estar no formato HH:MM; recebido: "${texto}"`,
      );
    }

    const [hour, minute] = texto.split(":");
    return Timing.toSchedule(Number(hour), Number(minute));
  }

  static toSchedule(hour: number, minute: number): Timing {
    const hourIsValid = hour >= Timing.HOUR_MIN && hour <= Timing.HOUR_MAX;
    const minuteIsValid =
      minute >= Timing.MINUTE_MIN && minute <= Timing.MINUTE_MAX;
    if (
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      !hourIsValid ||
      !minuteIsValid
    ) {
      throw new ErroDeDominio(
        "horario_invalido",
        `Horário deve ter hora inteira de ${Timing.HOUR_MIN} a ${Timing.HOUR_MAX} e minuto inteiro de ${Timing.MINUTE_MIN} a ${Timing.MINUTE_MAX}; recebido: hora ${hour}, minuto ${minute}`,
      );
    }
    return new Timing(hour, minute);
  }

  minutesOfDay(): number {
    return this.hour * 60 + this.minute;
  }

  equal(outro: Timing): boolean {
    return this.minutesOfDay() === outro.minutesOfDay();
  }

  isBefore(outro: Timing): boolean {
    return this.minutesOfDay() < outro.minutesOfDay();
  }

  // O dia é um círculo de 1440 min: entre 23:50 e 00:10, o caminho curto tem 20 min, e o longo, 1420.
  distanceInMinutes(outro: Timing): number {
    const diferenca = Math.abs(this.minutesOfDay() - outro.minutesOfDay());
    return Math.min(diferenca, Timing.MINUTES_PER_DAY - diferenca);
  }

  toString(): string {
    const hh = String(this.hour).padStart(2, "0");
    const mm = String(this.minute).padStart(2, "0");
    return `${hh}:${mm}`;
  }
}
