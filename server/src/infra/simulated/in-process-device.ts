import type { ConfigPayload } from "../../application/dto.js";
import type {
  Clock,
  Device,
  DeviceListeners,
} from "../../application/ports.js";
import type {
  CommandResult,
  DeviceCommand,
} from "../../domain/device/device.js";
import {
  SimulatedDevice,
  type SimulatedDeviceOptions,
} from "./simulated-device.js";

type Log = { error(obj: unknown, msg: string): void };

// O dispositivo simulado rodando dentro do próprio servidor: o modo demonstração, sem broker e sem ESP32.
export class InProcessDevice implements Device {
  readonly simulated: SimulatedDevice;
  private listeners: DeviceListeners | null = null;
  private queue: Promise<void> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    clock: Clock,
    options: Omit<SimulatedDeviceOptions, "clock" | "emitEvent"> = {},
    private readonly log: Log = { error: () => {} },
  ) {
    this.simulated = new SimulatedDevice({
      ...options,
      clock,
      emitEvent: (event) => this.enqueue((l) => l.event(event)),
    });
  }

  listen(listeners: DeviceListeners): void {
    this.listeners = listeners;
    this.enqueue((l) => l.online(true));
    this.simulated.start();
    this.pushState();
  }

  // Roda a agenda uma vez por segundo. Os testes chamam `tick()` na mão.
  startTicking(intervalMs = 1000): void {
    this.timer = setInterval(() => this.tick(), intervalMs);
    this.timer.unref();
  }

  tick(): void {
    this.simulated.tick();
    this.pushState();
  }

  async send(command: DeviceCommand): Promise<CommandResult> {
    const result = this.simulated.handle(command);
    this.pushState();
    return result;
  }

  async publishConfiguration(payload: ConfigPayload): Promise<void> {
    this.simulated.applyConfiguration(payload);
    this.pushState();
  }

  async publishSync(lastSeq: number): Promise<void> {
    this.simulated.fastForward(lastSeq);
  }

  // Espera tudo o que o dispositivo emitiu ser processado (para os testes).
  async settled(): Promise<void> {
    // Processar uma mensagem pode gerar outras: espera até a fila parar de crescer.
    let current: Promise<void>;
    do {
      current = this.queue;
      await current;
    } while (current !== this.queue);
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.settled();
  }

  private pushState(): void {
    this.enqueue((l) => l.state(this.simulated.state()));
  }

  // Uma fila só, para os eventos chegarem na ordem em que saíram.
  private enqueue(deliver: (listeners: DeviceListeners) => Promise<void>) {
    this.queue = this.queue.then(async () => {
      if (!this.listeners) return;
      try {
        await deliver(this.listeners);
      } catch (err) {
        this.log.error({ err }, "erro ao processar mensagem do dispositivo");
      }
    });
  }
}
