import { createServer, type Server } from "node:net";
import { Aedes } from "aedes";

export type EmbeddedBrokerOptions = {
  port: number;
  host?: string;
  // Sem usuário e senha, o broker aceita qualquer cliente: só para testes.
  username?: string;
  password?: string;
};

export type EmbeddedBroker = {
  port: number;
  close(): Promise<void>;
};

// Um broker MQTT dentro do próprio servidor: o ESP32 conecta aqui, e não é preciso instalar o Mosquitto.
export async function startEmbeddedBroker(
  options: EmbeddedBrokerOptions,
): Promise<EmbeddedBroker> {
  const aedes = await Aedes.createBroker();

  if (options.username && options.password) {
    const { username, password } = options;
    aedes.authenticate = (_client, user, pass, callback) => {
      const ok = user === username && pass?.toString() === password;
      callback(null, ok);
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
    async close() {
      await new Promise<void>((resolve) => aedes.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
