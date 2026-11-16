import type { FeederProfile } from "../domain/feeder/feeder-profile.js";
import { AlertService } from "./alert-service.js";
import { DeviceService } from "./device-service.js";
import { FeederService } from "./feeder-service.js";
import type {
  Clock,
  DeviceHandle,
  FeederRepositories,
  Notifier,
  UserNotifier,
} from "./ports.js";

type Log = { warn(obj: unknown, msg: string): void };

// Um comedouro "ligado": os casos de uso de sempre (agenda, servir, histórico, avisos), presos a um id,
// aos repositórios dele e ao dispositivo dele.
export class FeederRuntime {
  readonly feeders: FeederService;
  readonly alerts: AlertService;
  readonly devices: DeviceService;

  constructor(
    // Mutável: o apelido pode mudar com o comedouro ligado.
    public profile: FeederProfile,
    readonly repositories: FeederRepositories,
    readonly handle: DeviceHandle,
    notifier: UserNotifier,
    clock: Clock,
    log?: Log,
  ) {
    // Os avisos vão para o dono, com o apelido na frente (D16): "Cozinha: Ração acabando".
    const feederNotifier: Notifier = {
      notify: (title, body) =>
        notifier.notify(
          this.profile.ownerId,
          `${this.profile.nickname}: ${title}`,
          body,
        ),
    };

    this.feeders = new FeederService(repositories.feeder, handle.device, log);
    this.alerts = new AlertService(
      repositories.alerts,
      feederNotifier,
      clock,
      log,
    );
    this.devices = new DeviceService(
      handle.device,
      repositories.events,
      repositories.status,
      this.feeders,
      this.alerts,
      clock,
    );
  }

  get id(): string {
    return this.profile.id;
  }

  get simulator() {
    return this.handle.simulator;
  }

  // O `sync` vai primeiro: os eventos novos continuam a numeração do que já está salvo.
  async start(): Promise<void> {
    await this.handle.device.publishSync(
      await this.repositories.events.lastSeq(),
    );
    this.devices.start();
    await this.feeders.republish();
    this.handle.run();
  }

  async stop(): Promise<void> {
    await this.handle.device.close();
  }
}
