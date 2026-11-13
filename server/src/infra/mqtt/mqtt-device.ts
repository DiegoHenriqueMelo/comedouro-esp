import { randomUUID } from "node:crypto";
import mqtt, { type MqttClient } from "mqtt";
import type { ConfigPayload } from "../../application/dto.js";
import type { Device, DeviceListeners } from "../../application/ports.js";
import type {
  CommandResult,
  DeviceCommand,
} from "../../domain/device/device.js";
import {
  decodeEvent,
  decodeResponse,
  decodeState,
  encodeCommand,
  topics,
} from "./protocol.js";

type Log = {
  info(obj: unknown, msg: string): void;
  warn(obj: unknown, msg: string): void;
  error(obj: unknown, msg: string): void;
};

export type MqttDeviceOptions = {
  url: string;
  username?: string;
  password?: string;
  feederId: string;
  // Quanto esperar a resposta de um comando antes de considerar o dispositivo offline.
  commandTimeoutMs?: number;
  log?: Log;
};

const silent: Log = { info: () => {}, warn: () => {}, error: () => {} };

// O ESP32 de verdade (ou o simulador), do outro lado do broker MQTT.
export class MqttDevice implements Device {
  private readonly client: MqttClient;
  private readonly t: ReturnType<typeof topics>;
  private readonly timeoutMs: number;
  private readonly log: Log;
  private readonly pending = new Map<string, (result: CommandResult) => void>();
  private listeners: DeviceListeners | null = null;
  private deviceOnline = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: MqttDeviceOptions) {
    this.t = topics(options.feederId);
    this.timeoutMs = options.commandTimeoutMs ?? 5000;
    this.log = options.log ?? silent;

    this.client = mqtt.connect(options.url, {
      // Sessão persistente: o broker guarda os eventos QoS 1 enquanto o servidor está fora.
      clientId: `servidor-${options.feederId}`,
      clean: false,
      reconnectPeriod: 2000,
      ...(options.username ? { username: options.username } : {}),
      ...(options.password ? { password: options.password } : {}),
    });

    this.client.on("connect", () => {
      this.log.info({ url: options.url }, "conectado ao broker MQTT");
      this.client.subscribe(
        [this.t.event, this.t.state, this.t.online, this.t.response],
        { qos: 1 },
      );
    });
    this.client.on("error", (err) => {
      this.log.warn({ err: err.message }, "erro na conexão MQTT");
    });
    this.client.on("message", (topic, payload) => {
      this.enqueue(() => this.handle(topic, payload.toString("utf8")));
    });
  }

  listen(listeners: DeviceListeners): void {
    this.listeners = listeners;
  }

  async send(command: DeviceCommand): Promise<CommandResult> {
    if (!this.client.connected || !this.deviceOnline) {
      return { result: "offline" };
    }

    const id = randomUUID();
    const answer = new Promise<CommandResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ result: "offline" });
      }, this.timeoutMs);

      this.pending.set(id, (result) => {
        clearTimeout(timer);
        this.pending.delete(id);
        resolve(result);
      });
    });

    await this.client.publishAsync(this.t.command, encodeCommand(id, command), {
      qos: 1,
    });
    return answer;
  }

  async publishConfiguration(payload: ConfigPayload): Promise<void> {
    await this.publishRetained(this.t.config, JSON.stringify(payload));
  }

  async publishSync(lastSeq: number): Promise<void> {
    await this.publishRetained(
      this.t.sync,
      JSON.stringify({ ultimoSeq: lastSeq }),
    );
  }

  get connected(): boolean {
    return this.client.connected;
  }

  async close(): Promise<void> {
    await this.queue;
    // Fecha sem esperar o que ficou na fila: a configuração é publicada de novo quando o servidor sobe.
    await this.client.endAsync(true);
  }

  // Sem conexão, a biblioteca guarda a mensagem e envia ao reconectar; não espera por isso.
  private async publishRetained(topic: string, text: string): Promise<void> {
    const sent = this.client.publishAsync(topic, text, {
      qos: 1,
      retain: true,
    });
    if (this.client.connected) {
      await sent;
    } else {
      sent.catch((err) =>
        this.log.warn({ err, topic }, "mensagem retida não enviada"),
      );
    }
  }

  private async handle(topic: string, text: string): Promise<void> {
    if (topic === this.t.response) {
      const { id, result } = decodeResponse(text);
      this.pending.get(id)?.(result);
    } else if (topic === this.t.online) {
      this.deviceOnline = text === "1";
      await this.listeners?.online(this.deviceOnline);
    } else if (topic === this.t.event) {
      await this.listeners?.event(decodeEvent(text));
    } else if (topic === this.t.state) {
      await this.listeners?.state(decodeState(text));
    }
  }

  // Uma fila só, para as mensagens serem processadas na ordem em que chegaram.
  private enqueue(work: () => Promise<void>): void {
    this.queue = this.queue.then(async () => {
      try {
        await work();
      } catch (err) {
        this.log.error({ err }, "mensagem MQTT inválida ou não processada");
      }
    });
  }
}
