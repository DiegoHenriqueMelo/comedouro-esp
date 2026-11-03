import { Configuration } from "./configuration.js";
import { ScheduledMeal } from "./scheduled-meal.js";

export class Feeder {
  private _schedule: ScheduledMeal[];
  private _configuration: Configuration;
  private _version: number = 0;

  private constructor(schedule: ScheduledMeal[], configuration: Configuration) {
    this._schedule = schedule;
    this._configuration = configuration;
    this._version++;
  }

  static create(schedule: ScheduledMeal[]): Feeder {
    return new Feeder(schedule, Configuration.default());
  }

  get versao(): number {
    return this._version;
  }

  get schedules(): ScheduledMeal[] {
    return [...this._schedule];
  }

  replaceScheduled(meals: ScheduledMeal): void {
    this._schedule.push(meals);
  }
}
