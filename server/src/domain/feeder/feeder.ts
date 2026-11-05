import { ErroDeDominio } from "../shared/erro-de-dominio.js";
import { Configuration } from "./configuration.js";
import type { ScheduledMeal } from "./scheduled-meal.js";

export class Feeder {
  static readonly MAX_MEALS = 8;
  private _schedule: ScheduledMeal[];
  private _configuration: Configuration;
  private _version: number = 1;

  private constructor(schedule: ScheduledMeal[], configuration: Configuration) {
    this._schedule = schedule;
    this._configuration = configuration;
  }

  static create(): Feeder {
    return new Feeder([], Configuration.default());
  }

  get version(): number {
    return this._version;
  }

  get schedule(): ScheduledMeal[] {
    return [...this._schedule];
  }

  get configuration(): Configuration {
    return this._configuration;
  }

  replaceSchedule(meals: ScheduledMeal[]): void {
    if (meals.length > Feeder.MAX_MEALS) {
      throw new ErroDeDominio(
        "agenda_cheia",
        `a agenda aceita no máximo ${Feeder.MAX_MEALS} refeições; recebido: ${meals.length}`,
      );
    }

    const minutes = meals.map((m) => m.timing.minutesOfDay());
    const noRepeat = new Set(minutes);

    if (noRepeat.size < meals.length) {
      throw new ErroDeDominio(
        "horario_repetido",
        "a agenda tem duas refeições no mesmo horário",
      );
    }
    const actives = meals.filter((m) => m.active);
    const total = actives.reduce((soma, m) => soma + m.portion.value, 0);

    if (total > this.configuration.dailyLimitPortions) {
      throw new ErroDeDominio(
        "agenda_acima_do_limite",
        "Não há espaço na agenda.",
      );
    }
    for (const [i, a] of actives.entries()) {
      for (const b of actives.slice(i + 1)) {
        if (
          a.timing.distanceInMinutes(b.timing) <
          this.configuration.minIntervalMinutes
        ) {
          throw new ErroDeDominio(
            "horarios_muito_proximos",
            "O intervalo entre as refeições está curto",
          );
        }
      }
    }

    this._schedule = [...meals];
    this._version++;
  }
}
