import type { Portion } from "./portion.js";
import type { Timing } from "./timing.js";

export class ScheduledMeal {
  readonly portion: Portion;
  readonly timing: Timing;
  readonly active: boolean;

  private constructor(timing: Timing, portion: Portion, active: boolean) {
    this.portion = portion;
    this.timing = timing;
    this.active = active;
  }

  static create(
    timing: Timing,
    portion: Portion,
    active = true,
  ): ScheduledMeal {
    return new ScheduledMeal(timing, portion, active);
  }
}
