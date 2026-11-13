import mqtt, { type MqttClient } from "mqtt";
import type { ConfigPayload } from "../application/dto.js";
import type { Clock } from "../application/ports.js";
import type { DeviceEvent } from "../domain/device/device.js";
import {
  decodeCommand,
  encodeEvent,
  encodeResponse,
  encodeState,
  syncSchema,
  topics,
} from "../infra/mqtt/protocol.js";
import {
  SimulatedDevice,
  type SimulatedDeviceOptions,
} from "../infra/simulated/simulated-device.js";

export type MqttSimulatorOptions = {
  url: string;
  username?: string;
  password?: string;
  feederId: string;
  clock: Clock;
  device?: Omit<SimulatedDeviceOptions, "clock" | "emitEvent">;
  // Quanto esperar o `sync` do servidor antes de começar sozinho (primeira vez, sem servidor).
  syncWaitMs?: number;
  log?: (message: string) => void;
};

// O "ESP32 de mentira": conversa com o servidor pelo broker, exatamente como o firmware vai conversar.
// Serve para desenvolver e testar o sistema inteiro sem a placa.
export class MqttSimulator {
  readonly device: SimulatedDevice;
  private readonly client: MqttClient;
  private readonly t: ReturnType<typeof topics>;
  private readonly log: (message: string) => void;
  // Tudo o que aconteceu fica guardado: é o que o firmware guarda no LittleFS para reenviar.
  private readonly history: DeviceEvent[] = [];
  private started = false;
  private lastState = "";
  private tickTimer: NodeJS.Timeout | null = null;
  private startTimer: NodeJS.Timeout | null = null;

  constructor(options: MqttSimulatorOptions) {
    this.t = topics(options.feederId);
    this.log = options.log ?? (() => {});

    this.device = new SimulatedDevice({
      ...options.device,
      clock: options.clock,
      emitEvent: (event) => {
        this.history.push(event);
        this.publishEvent(event);
        this.log(`evento ${event.seq}: ${event.type}`);
      },
    });

    this.client = mqtt.connect(options.url, {
      clientId: `alimentador-${options.feederId}`,
      clean: true,
      reconnectPeriod: 2000,
      ...(options.username ? { username: options.username } : {}),
      ...(options.password ? { password: options.password } : {}),
      // Last will: se o dispositivo sumir sem avisar, o broker publica "0" por ele.
      will: { topic: this.t.online, payload: "0", qos: 1, retain: true },
    });

    this.client.on("connect", () => {
      this.log("conectado ao broker");
      this.client.publish(this.t.online, "1", { qos: 1, retain: true });
      this.client.subscribe([this.t.config, this.t.sync, this.t.command], {
        qos: 1,
      });
      // Sem `sync` retido (servidor nunca subiu), começa sozinho depois de um tempo.
      if (!this.started && !this.startTimer) {
        this.startTimer = setTimeout(
          () => this.begin(),
          options.syncWaitMs ?? 1500,
        );
      }
      this.lastState = "";
      this.publishState();
    });

    this.client.on("message", (topic, payload) => {
      try {
        this.handle(topic, payload.toString("utf8"));
      } catch (err) {
        this.log(`mensagem inválida em ${topic}: ${String(err)}`);
      }
    });
  }

  // Roda a agenda e publica o estado quando ele muda.
  tick(): void {
    this.device.tick();
    this.publishState();
  }

  startTicking(intervalMs = 1000): void {
    this.tickTimer = setInterval(() => this.tick(), intervalMs);
  }

  // Desliga "direito": avisa que saiu.
  async stop(): Promise<void> {
    this.clearTimers();
    if (this.client.connected) {
      await this.client.publishAsync(this.t.online, "0", {
        qos: 1,
        retain: true,
      });
    }
    await this.client.endAsync();
  }

  // Cai sem avisar (queda de luz): o broker percebe e publica o last will.
  crash(): void {
    this.clearTimers();
    this.client.stream.destroy();
    this.client.end(true);
  }

  private handle(topic: string, text: string): void {
    if (topic === this.t.config) {
      const payload = JSON.parse(text) as ConfigPayload;
      this.device.applyConfiguration(payload);
      this.log(`configuração aplicada: versão ${payload.versao}`);
      this.publishState();
    } else if (topic === this.t.sync) {
      const { ultimoSeq } = syncSchema.parse(JSON.parse(text));
      // O servidor já tem até esse número: continua dali e reenvia o que ele não viu.
      this.device.fastForward(ultimoSeq);
      for (const event of this.history) {
        if (event.seq > ultimoSeq) this.publishEvent(event);
      }
      this.begin();
    } else if (topic === this.t.command) {
      const { id, command } = decodeCommand(text);
      const result = this.device.handle(command);
      this.client.publish(this.t.response, encodeResponse(id, result), {
        qos: 1,
      });
      this.log(`comando ${command.type}: ${result.result}`);
      this.publishState();
    }
  }

  private begin(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    this.startTimer = null;
    if (this.started) return;
    this.started = true;
    this.device.start();
  }

  private publishEvent(event: DeviceEvent): void {
    // Sem conexão, o evento fica no histórico e segue quando o servidor mandar o `sync`.
    if (!this.client.connected) return;
    this.client.publish(this.t.event, encodeEvent(event), { qos: 1 });
  }

  private publishState(): void {
    if (!this.client.connected) return;
    const state = this.device.state();
    // Só publica quando algo mudou (a hora muda sempre, então fica de fora da comparação).
    const fingerprint = JSON.stringify({ ...state, at: null });
    if (fingerprint === this.lastState) return;
    this.lastState = fingerprint;
    this.client.publish(this.t.state, encodeState(state), {
      qos: 0,
      retain: true,
    });
  }

  private clearTimers(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.startTimer) clearTimeout(this.startTimer);
    this.tickTimer = null;
    this.startTimer = null;
  }
}
