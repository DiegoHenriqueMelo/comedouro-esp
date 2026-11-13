import { Feeder } from "../domain/feeder/feeder.js";
import {
  type ConfigDto,
  fromConfigDto,
  fromScheduleDto,
  type ScheduleItemDto,
  toConfigPayload,
} from "./dto.js";
import type { Device, FeederRepository } from "./ports.js";

type Log = { warn(obj: unknown, msg: string): void };

// Casos de uso do alimentador: carregar, deixar o domínio decidir, salvar e só então publicar.
export class FeederService {
  constructor(
    private readonly repository: FeederRepository,
    private readonly device: Pick<Device, "publishConfiguration">,
    private readonly log: Log = { warn: () => {} },
  ) {}

  // Na primeira execução, cria o alimentador padrão e salva.
  async get(): Promise<Feeder> {
    const saved = await this.repository.load();
    if (saved) return saved;

    const feeder = Feeder.create();
    await this.repository.save(feeder, null);
    return feeder;
  }

  async updateSchedule(items: ScheduleItemDto[]): Promise<Feeder> {
    return this.change((feeder) =>
      feeder.replaceSchedule(fromScheduleDto(items)),
    );
  }

  async updateConfiguration(dto: ConfigDto): Promise<Feeder> {
    return this.change((feeder) =>
      feeder.replaceConfiguration(fromConfigDto(dto)),
    );
  }

  // Manda a configuração atual para o dispositivo (ao subir o servidor e quando o dispositivo volta).
  async republish(): Promise<void> {
    await this.publish(await this.get());
  }

  private async change(mutate: (feeder: Feeder) => void): Promise<Feeder> {
    const feeder = await this.get();
    const expectedVersion = feeder.version;

    mutate(feeder);
    await this.repository.save(feeder, expectedVersion);

    // Só publica o que foi salvo: se a gravação falhar, o erro sai antes daqui.
    if (feeder.pullEvents().length > 0) await this.publish(feeder);
    return feeder;
  }

  // Se o dispositivo estiver fora do ar, a mudança continua salva e segue para ele na próxima sincronização.
  private async publish(feeder: Feeder): Promise<void> {
    try {
      await this.device.publishConfiguration(toConfigPayload(feeder));
    } catch (err) {
      this.log.warn({ err }, "não foi possível publicar a configuração");
    }
  }
}
