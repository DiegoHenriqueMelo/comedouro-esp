import { createServer, type Server } from "node:net";
import { Aedes, type Client } from "aedes";
import {
  type BrokerIdentity,
  DeviceAccess,
} from "../../application/device-access.js";

export type EmbeddedBrokerOptions = {
  port: number;
  host?: string;
  // Quem entra e o que é cada um. Sem isto, o broker aceita qualquer cliente: só para testes.
  authenticate?: (
    username: string | undefined,
    password: string | undefined,
  ) => Promise<BrokerIdentity | null>;
};

export type EmbeddedBroker = {
  port: number;
  // Derruba o aparelho de um comedouro que foi removido (D15).
  disconnectFeeder(feederId: string): void;
  close(): Promise<void>;
};

// O que o broker lembra de cada cliente conectado.
const identities = new WeakMap<Client, BrokerIdentity>();

// Um broker MQTT dentro do próprio servidor: o ESP32 conecta aqui, e não é preciso instalar o Mosquitto.
export async function startEmbeddedBroker(
  options: EmbeddedBrokerOptions,
): Promise<EmbeddedBroker> {
  const aedes = await Aedes.createBroker();
  const authenticate = options.authenticate;

  const connected = new Set<Client>();
  aedes.on("client", (client) => connected.add(client));
  aedes.on("clientDisconnect", (client) => connected.delete(client));

  if (authenticate) {
    aedes.authenticate = (client, user, pass, callback) => {
      authenticate(user, pass?.toString())
        .then((identity) => {
          if (identity) identities.set(client, identity);
          callback(null, identity !== null);
        })
        .catch(() => callback(null, false));
    };

    // Cada aparelho só publica e assina nos tópicos do próprio comedouro.
    aedes.authorizePublish = (client, packet, callback) => {
      const identity = client ? identities.get(client) : undefined;
      if (
        client &&
        (!identity || !DeviceAccess.canUseTopic(identity, packet.topic))
      ) {
        return callback(new Error("tópico não autorizado"));
      }
      callback(null);
    };
    aedes.authorizeSubscribe = (client, subscription, callback) => {
      const identity = identities.get(client);
      if (
        !identity ||
        !DeviceAccess.canUseTopic(identity, subscription.topic)
      ) {
        return callback(new Error("tópico não autorizado"), null);
      }
      callback(null, subscription);
    };
  }

  const server: Server = createServer(aedes.handle);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host ?? "0.0.0.0", resolve);
  });

  const address = server.address();
  const port =
    typeof address === "object" && address ? address.port : options.port;

  return {
    port,
    disconnectFeeder(feederId) {
      for (const client of connected) {
        const identity = identities.get(client);
        if (identity?.kind === "aparelho" && identity.feederId === feederId) {
          client.close();
        }
      }
    },
    async close() {
      await new Promise<void>((resolve) => aedes.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
