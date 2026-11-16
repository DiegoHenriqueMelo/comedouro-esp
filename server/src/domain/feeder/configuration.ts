import { ErroDeDominio } from "../shared/erro-de-dominio.js";

export type ConfigurationProps = {
  gramsPerPortion: number;
  dailyLimitPortions: number;
  minIntervalMinutes: number;
  bowlLimitGrams: number;
  bottleHeightMm: number;
  fillAngle: number;
  serveAngle: number;
  timeZone: string;
};

// Os quatro fusos do Brasil e o formato POSIX que o ESP32 usa (dúvida 2 do glossário).
export const TIME_ZONES: Record<string, string> = {
  "America/Noronha": "<-02>2",
  "America/Sao_Paulo": "<-03>3",
  "America/Manaus": "<-04>4",
  "America/Rio_Branco": "<-05>5",
};

function between(valor: number, min: number, max: number): boolean {
  return Number.isFinite(valor) && valor >= min && valor <= max;
}

// Os valores que dizem como o alimentador trabalha (glossário: Configuração, regras R7 a R12).
export class Configuration {
  readonly gramsPerPortion: number;
  readonly dailyLimitPortions: number;
  readonly minIntervalMinutes: number;
  readonly bowlLimitGrams: number;
  readonly bottleHeightMm: number;
  readonly fillAngle: number;
  readonly serveAngle: number;
  readonly timeZone: string;

  private constructor(props: ConfigurationProps) {
    this.gramsPerPortion = props.gramsPerPortion;
    this.dailyLimitPortions = props.dailyLimitPortions;
    this.minIntervalMinutes = props.minIntervalMinutes;
    this.bowlLimitGrams = props.bowlLimitGrams;
    this.bottleHeightMm = props.bottleHeightMm;
    this.fillAngle = props.fillAngle;
    this.serveAngle = props.serveAngle;
    this.timeZone = props.timeZone;
  }

  static create(props: ConfigurationProps): Configuration {
    // R7
    if (
      !(props.gramsPerPortion > 0) ||
      !between(props.gramsPerPortion, 0, 30)
    ) {
      throw new ErroDeDominio(
        "gramas_por_porcao_invalido",
        `gramas por porção deve ser maior que 0 e até 30; recebido: ${props.gramsPerPortion}`,
      );
    }
    // R8
    if (
      !Number.isInteger(props.dailyLimitPortions) ||
      !between(props.dailyLimitPortions, 1, 30)
    ) {
      throw new ErroDeDominio(
        "limite_diario_invalido",
        `o limite diário deve ser um inteiro de 1 a 30; recebido: ${props.dailyLimitPortions}`,
      );
    }
    // R9
    if (
      !Number.isInteger(props.minIntervalMinutes) ||
      !between(props.minIntervalMinutes, 15, 720)
    ) {
      throw new ErroDeDominio(
        "intervalo_minimo_invalido",
        `o intervalo mínimo deve ser um inteiro de 15 a 720 min; recebido: ${props.minIntervalMinutes}`,
      );
    }
    // R10
    if (!between(props.bowlLimitGrams, 0, 100)) {
      throw new ErroDeDominio(
        "limite_tigela_invalido",
        `o limite da tigela deve ficar de 0 a 100 g; recebido: ${props.bowlLimitGrams}`,
      );
    }
    // R11
    if (!Object.hasOwn(TIME_ZONES, props.timeZone)) {
      throw new ErroDeDominio(
        "fuso_invalido",
        `fuso desconhecido: "${props.timeZone}"`,
      );
    }
    if (!between(props.bottleHeightMm, 50, 500)) {
      throw new ErroDeDominio(
        "altura_garrafa_invalida",
        `a altura da garrafa deve ficar de 50 a 500 mm; recebido: ${props.bottleHeightMm}`,
      );
    }
    // R12
    if (
      !between(props.fillAngle, 0, 180) ||
      !between(props.serveAngle, 0, 180) ||
      props.fillAngle === props.serveAngle
    ) {
      throw new ErroDeDominio(
        "angulos_invalidos",
        `os ângulos devem ficar de 0 a 180 e ser diferentes entre si; recebido: encher ${props.fillAngle}, servir ${props.serveAngle}`,
      );
    }

    return new Configuration(props);
  }

  static default(): Configuration {
    return Configuration.create({
      gramsPerPortion: 6,
      dailyLimitPortions: 10,
      minIntervalMinutes: 30,
      bowlLimitGrams: 10,
      bottleHeightMm: 230,
      fillAngle: 0,
      serveAngle: 60,
      timeZone: "America/Sao_Paulo",
    });
  }
}
