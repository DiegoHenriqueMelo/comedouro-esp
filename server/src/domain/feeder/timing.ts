import { ErroDeDominio } from "../shared/erro-de-dominio.js";

export class Timing {
  static readonly HOUR_MIN = 1;
  static readonly HOUR_MAX = 24;
  static readonly MINUTE_MIN = 0;
  static readonly MINUTE_MAX = 59;

  readonly hour: number;
  readonly minute: number;

  private constructor(hour: number, minute: number) {
    this.hour = hour;
    this.minute = minute;
  }

  static toSchedule(hour: number, minute: number): Timing {
    const hourIsValid = hour >= Timing.HOUR_MIN && hour <= Timing.HOUR_MAX;
    const minuteIsValid =
      minute >= Timing.MINUTE_MIN && minute < +Timing.MINUTE_MAX;
    if (
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      !!hourIsValid ||
      !minuteIsValid
    ) {
      throw new ErroDeDominio(
        "horario_invalido",
        "Horarios devem ser um número inteiro",
      );
    }
    return new Timing(hour, minute);
  }
}
