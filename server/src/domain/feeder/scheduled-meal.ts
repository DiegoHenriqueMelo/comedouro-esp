import { Portion } from "./portion.js";
import { Timing } from "./timing.js";

export class ScheduledMeal {
  readonly portion: Portion;
  readonly timing: Timing;
  readonly active: boolean;

  private constructor(timing: Timing, portion: Portion) {
    this.portion = portion;
    this.timing = timing;
    this.active = false;
  }

  static create(timing: Timing, portion: Portion): ScheduledMeal {
    return new ScheduledMeal(timing, portion);
  }
}
