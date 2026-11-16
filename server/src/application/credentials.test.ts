import { describe, expect, it } from "vitest";
import { MemoryDeviceCredentialRepository } from "../infra/memory/memory-repositories.js";
import {
  hashPassword,
  newDevicePassword,
  verifyPassword,
} from "./credentials.js";
import { DeviceAccess } from "./device-access.js";

describe("senha dos aparelhos", () => {
  it("o hash confere com a senha certa e não com outra", async () => {
    const senha = newDevicePassword();
    const hash = await hashPassword(senha);

    expect(hash).not.toContain(senha);
    expect(await verifyPassword(senha, hash)).toBe(true);
    expect(await verifyPassword(`${senha}x`, hash)).toBe(false);
  });

  it("a mesma senha gera hashes diferentes (o sal muda)", async () => {
    expect(await hashPassword("abc")).not.toBe(await hashPassword("abc"));
  });

  it("um hash em formato desconhecido nunca confere", async () => {
    expect(await verifyPassword("abc", "md5:qualquer")).toBe(false);
    expect(await verifyPassword("abc", "")).toBe(false);
  });
});

describe("quem entra no broker", () => {
  const server = { username: "servidor", password: "senha-do-servidor" };

  async function access() {
    const credentials = new MemoryDeviceCredentialRepository();
    await credentials.save({
      feederId: "f1",
      username: "f1",
      passwordHash: await hashPassword("senha-f1"),
    });
    return new DeviceAccess(credentials, server);
  }

  it("o servidor entra com o usuário dele", async () => {
    const a = await access();

    expect(await a.authenticate("servidor", "senha-do-servidor")).toEqual({
      kind: "servidor",
    });
    expect(await a.authenticate("servidor", "errada")).toBeNull();
  });

  it("o aparelho entra com a credencial do comedouro dele", async () => {
    const a = await access();

    expect(await a.authenticate("f1", "senha-f1")).toEqual({
      kind: "aparelho",
      feederId: "f1",
    });
    expect(await a.authenticate("f1", "errada")).toBeNull();
    expect(await a.authenticate("f2", "senha-f1")).toBeNull();
    expect(await a.authenticate(undefined, undefined)).toBeNull();
  });

  it("o aparelho só usa os tópicos do próprio comedouro", () => {
    const f1 = { kind: "aparelho" as const, feederId: "f1" };

    expect(DeviceAccess.canUseTopic(f1, "alimentador/f1/evento")).toBe(true);
    expect(DeviceAccess.canUseTopic(f1, "alimentador/f2/evento")).toBe(false);
    expect(DeviceAccess.canUseTopic(f1, "alimentador/f1")).toBe(false);
    expect(DeviceAccess.canUseTopic(f1, "#")).toBe(false);
    expect(DeviceAccess.canUseTopic({ kind: "servidor" }, "#")).toBe(true);
  });
});
