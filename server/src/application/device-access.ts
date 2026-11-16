import { timingSafeEqual } from "node:crypto";
import { verifyPassword } from "./credentials.js";
import type { DeviceCredentialRepository } from "./ports.js";

// Quem está conectando no broker MQTT: o próprio servidor, ou o aparelho de um comedouro.
export type BrokerIdentity =
  | { kind: "servidor" }
  | { kind: "aparelho"; feederId: string };

// Decide quem entra no broker e em quais tópicos cada um mexe.
export class DeviceAccess {
  constructor(
    private readonly credentials: DeviceCredentialRepository,
    private readonly server: { username: string; password: string },
  ) {}

  async authenticate(
    username: string | undefined,
    password: string | undefined,
  ): Promise<BrokerIdentity | null> {
    if (!username || !password) return null;
    if (username === this.server.username) {
      return sameText(password, this.server.password)
        ? { kind: "servidor" }
        : null;
    }
    const credential = await this.credentials.findByUsername(username);
    if (!credential) return null;
    if (!(await verifyPassword(password, credential.passwordHash))) return null;
    return { kind: "aparelho", feederId: credential.feederId };
  }

  // Um aparelho só publica e assina nos tópicos dele: alimentador/<id dele>/...
  static canUseTopic(identity: BrokerIdentity, topic: string): boolean {
    if (identity.kind === "servidor") return true;
    return topic.startsWith(`alimentador/${identity.feederId}/`);
  }
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
