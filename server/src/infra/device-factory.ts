import type {
  Clock,
  DeviceFactory,
  DeviceHandle,
} from "../application/ports.js";
import type { FeederKind } from "../domain/feeder/feeder-profile.js";
import { MqttDevice } from "./mqtt/mqtt-device.js";
import { InProcessDevice } from "./simulated/in-process-device.js";
import type { SimulatedDeviceOptions } from "./simulated/simulated-device.js";

type Log = {
  info(obj: unknown, msg: string): void;
  warn(obj: unknown, msg: string): void;
  error(obj: unknown, msg: string): void;
};

export type SimulatedOptions = {
  clock: Clock;
  device?: Omit<SimulatedDeviceOptions, "clock" | "emitEvent">;
  // true: o simulado roda a agenda sozinho, de segundo em segundo. Os testes deixam false e avançam na mão.
  autoTick: boolean;
  log?: Log;
};

export type MqttOptions = {
  url: string;
  username: string;
  password: string;
  log?: Log;
  // Chamado ao remover um comedouro: o broker derruba o aparelho.
  disconnect?: (feederId: string) => void;
};

// Cria o dispositivo de cada comedouro: o simulado roda dentro do servidor; o aparelho fala por MQTT.
export class ServerDeviceFactory implements DeviceFactory {
  // Os simulados criados, por id: os testes mexem no "mundo físico" deles.
  readonly simulated = new Map<string, InProcessDevice>();

  constructor(
    private readonly sim: SimulatedOptions,
    private readonly mqtt: MqttOptions | null,
  ) {}

  get supportsHardware(): boolean {
    return this.mqtt !== null;
  }

  create(feederId: string, kind: FeederKind): DeviceHandle {
    if (kind === "simulado") return this.createSimulated(feederId);
    if (!this.mqtt) {
      throw new Error("comedouro de aparelho sem broker MQTT configurado");
    }
    return this.createMqtt(feederId, this.mqtt);
  }

  private createSimulated(feederId: string): DeviceHandle {
    const device = new InProcessDevice(
      this.sim.clock,
      this.sim.device ?? {},
      this.sim.log,
    );
    this.simulated.set(feederId, device);
    return {
      device,
      simulator: device.simulated,
      run: () => {
        if (this.sim.autoTick) device.startTicking();
      },
      kick: () => {},
      forget: async () => {
        this.simulated.delete(feederId);
      },
    };
  }

  private createMqtt(feederId: string, mqtt: MqttOptions): DeviceHandle {
    const device = new MqttDevice({
      url: mqtt.url,
      username: mqtt.username,
      password: mqtt.password,
      feederId,
      ...(mqtt.log ? { log: mqtt.log } : {}),
    });
    return {
      device,
      simulator: null,
      run: () => {},
      kick: () => mqtt.disconnect?.(feederId),
      forget: async () => {
        await device.clearRetained();
        mqtt.disconnect?.(feederId);
      },
    };
  }
}
