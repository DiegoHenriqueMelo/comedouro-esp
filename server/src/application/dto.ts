import { Configuration, TIME_ZONES } from "../domain/feeder/configuration.js";
import type { Feeder } from "../domain/feeder/feeder.js";
import { Portion } from "../domain/feeder/portion.js";
import { ScheduledMeal } from "../domain/feeder/scheduled-meal.js";
import { Timing } from "../domain/feeder/timing.js";

// Os formatos que saem do servidor: a API /v1 e as mensagens para o ESP32 usam os nomes do plano (seção 3.5).

export type ScheduleItemDto = { hora: string; porcoes: number; ativo: boolean };

export type ConfigDto = {
  gramasPorPorcao: number;
  limiteDiarioPorcoes: number;
  intervaloMinimoMin: number;
  limiteTigelaGramas: number;
  fusoHorario: string;
  alturaGarrafaMm: number;
  anguloEncher: number;
  anguloServir: number;
};

// A configuração completa que vai para o ESP32 (tópico `config`, retido).
export type ConfigPayload = {
  versao: number;
  config: ConfigDto & { fusoPosix: string };
  agenda: ScheduleItemDto[];
};

export function toScheduleDto(meals: ScheduledMeal[]): ScheduleItemDto[] {
  return [...meals]
    .sort((a, b) => a.timing.minutesOfDay() - b.timing.minutesOfDay())
    .map((m) => ({
      hora: m.timing.toString(),
      porcoes: m.portion.value,
      ativo: m.active,
    }));
}

export function fromScheduleDto(items: ScheduleItemDto[]): ScheduledMeal[] {
  return items.map((item) =>
    ScheduledMeal.create(
      Timing.create(item.hora),
      Portion.create(item.porcoes),
      item.ativo,
    ),
  );
}

export function toConfigDto(c: Configuration): ConfigDto {
  return {
    gramasPorPorcao: c.gramsPerPortion,
    limiteDiarioPorcoes: c.dailyLimitPortions,
    intervaloMinimoMin: c.minIntervalMinutes,
    limiteTigelaGramas: c.bowlLimitGrams,
    fusoHorario: c.timeZone,
    alturaGarrafaMm: c.bottleHeightMm,
    anguloEncher: c.fillAngle,
    anguloServir: c.serveAngle,
  };
}

export function fromConfigDto(dto: ConfigDto): Configuration {
  return Configuration.create({
    gramsPerPortion: dto.gramasPorPorcao,
    dailyLimitPortions: dto.limiteDiarioPorcoes,
    minIntervalMinutes: dto.intervaloMinimoMin,
    bowlLimitGrams: dto.limiteTigelaGramas,
    timeZone: dto.fusoHorario,
    bottleHeightMm: dto.alturaGarrafaMm,
    fillAngle: dto.anguloEncher,
    serveAngle: dto.anguloServir,
  });
}

export function toConfigPayload(feeder: Feeder): ConfigPayload {
  const config = toConfigDto(feeder.configuration);
  return {
    versao: feeder.version,
    config: {
      ...config,
      fusoPosix: TIME_ZONES[config.fusoHorario] ?? "<-03>3",
    },
    agenda: toScheduleDto(feeder.schedule),
  };
}
