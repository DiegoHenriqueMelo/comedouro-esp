export class Configuration {
  readonly timeZone: string;
  readonly gramsPerPortion: number;
  readonly dailyLimitPortions: number;
  readonly minIntervalMinutes: number;
  readonly bowlLimitGrams: number;
  readonly bottleHeightMm: number;
  readonly fillAngle: number;
  readonly serveAngle: number;

  private constructor(
    gramsPerPortion: number,
    dailyLimitPortions: number,
    minIntervalMinutes: number,
    bowlLimitGrams: number,
    bottleHeightMm: number,
    fillAngle: number,
    serveAngle: number,
    timeZone: string,
  ) {
    this.gramsPerPortion = gramsPerPortion;
    this.dailyLimitPortions = dailyLimitPortions;
    this.minIntervalMinutes = minIntervalMinutes;
    this.bowlLimitGrams = bowlLimitGrams;
    this.bottleHeightMm = bottleHeightMm;
    this.fillAngle = fillAngle;
    this.serveAngle = serveAngle;
    this.timeZone = timeZone;
  }

  static default():Configuration {
    return new Configuration(6, 10, 30, 10, 230, 0, 60, "America/Sao_Paulo");
  }
}
