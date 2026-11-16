import {
  randomBytes,
  type ScryptOptions,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

// A senha MQTT de cada aparelho. Ela sai do servidor uma vez só; o banco guarda o hash (scrypt, com sal).

const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  const options: ScryptOptions = {};
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export function newDevicePassword(): string {
  return randomBytes(18).toString("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await derive(password, Buffer.from(saltHex, "hex"));
  // Comparação em tempo constante: o tempo da resposta não entrega quantos bytes bateram.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
