import { ErroDeDominio } from "../shared/erro-de-dominio.js";
import { Configuration } from "./configuration.js";
import type { ScheduledMeal } from "./scheduled-meal.js";

// Evento de domínio: toda mudança aceita registra um, e o caso de uso publica depois de salvar.
export type ConfigurationChanged = {
  type: "ConfiguracaoAlterada";
  version: number;
};

// O agregado: a configuração e a agenda, e as regras que valem entre as duas (glossário: Alimentador).
export class Feeder {
  static readonly MAX_MEALS = 8;
  private _schedule: ScheduledMeal[];
  private _configuration: Configuration;
  private _version: number;
  private _events: ConfigurationChanged[] = [];

  private constructor(
    schedule: ScheduledMeal[],
    configuration: Configuration,
    version: number,
  ) {
    this._schedule = schedule;
    this._configuration = configuration;
    this._version = version;
  }

  static create(): Feeder {
    return new Feeder([], Configuration.default(), 1);
  }

  // Para o repositório recriar um alimentador salvo. Confere as regras de novo: dado ruim no banco não entra.
  static restore(
    schedule: ScheduledMeal[],
    configuration: Configuration,
    version: number,
  ): Feeder {
    Feeder.assertValid(schedule, configuration);
    return new Feeder([...schedule], configuration, version);
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
    Feeder.assertValid(meals, this._configuration);

    this._schedule = [...meals];
    this.changed();
  }

  replaceConfiguration(configuration: Configuration): void {
    Feeder.assertValid(this._schedule, configuration);

    this._configuration = configuration;
    this.changed();
  }

  // Entrega os eventos pendentes e esvazia a lista.
  pullEvents(): ConfigurationChanged[] {
    const events = this._events;
    this._events = [];
    return events;
  }

  private changed(): void {
    this._version++;
    this._events.push({ type: "ConfiguracaoAlterada", version: this._version });
  }

  // As regras R1, R2, R5 e R6. As duas trocas passam por aqui, porque a R5 e a R6
  // olham a agenda e a configuração ao mesmo tempo.
  private static assertValid(
    meals: ScheduledMeal[],
    configuration: Configuration,
  ): void {
    if (meals.length > Feeder.MAX_MEALS) {
      throw new ErroDeDominio(
        "agenda_cheia",
        `a agenda aceita no máximo ${Feeder.MAX_MEALS} refeições; recebido: ${meals.length}`,
      );
    }

    const minutes = meals.map((m) => m.timing.minutesOfDay());
    if (new Set(minutes).size < meals.length) {
      throw new ErroDeDominio(
        "horario_repetido",
        "a agenda tem duas refeições no mesmo horário",
      );
    }

    const actives = meals.filter((m) => m.active);
    const total = actives.reduce((soma, m) => soma + m.portion.value, 0);
    if (total > configuration.dailyLimitPortions) {
      throw new ErroDeDominio(
        "agenda_acima_do_limite",
        `as porções ativas somam ${total}, acima do limite diário de ${configuration.dailyLimitPortions}`,
      );
    }

    for (const [i, a] of actives.entries()) {
      for (const b of actives.slice(i + 1)) {
        const distance = a.timing.distanceInMinutes(b.timing);
        if (distance < configuration.minIntervalMinutes) {
          throw new ErroDeDominio(
            "horarios_muito_proximos",
            `${a.timing} e ${b.timing} estão a ${distance} min, menos que o intervalo mínimo de ${configuration.minIntervalMinutes} min`,
          );
        }
      }
    }
  }
}
