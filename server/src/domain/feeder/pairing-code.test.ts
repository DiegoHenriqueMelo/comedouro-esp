import { describe, expect, it } from "vitest";
import { PairingCode } from "./pairing-code.js";

const now = new Date("2026-11-16T12:00:00.000Z");
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

describe("PairingCode", () => {
  it("vale por 10 minutos", () => {
    const code = PairingCode.issue("f1", "482913", now);

    expect(code.expiresAt).toEqual(minutes(10));
    expect(code.isActiveAt(minutes(9.9))).toBe(true);
    expect(code.isActiveAt(minutes(10))).toBe(false);
  });

  it("serve uma vez só", () => {
    const code = PairingCode.issue("f1", "482913", now);

    code.use(minutes(1));

    expect(code.isActiveAt(minutes(2))).toBe(false);
    expect(() => code.use(minutes(2))).toThrow(
      expect.objectContaining({ codigo: "codigo_invalido" }),
    );
  });

  it("vencido não serve, com o mesmo erro de um código usado", () => {
    const code = PairingCode.issue("f1", "482913", now);

    expect(() => code.use(minutes(11))).toThrow(
      expect.objectContaining({ codigo: "codigo_invalido" }),
    );
  });

  it("o código tem exatamente 6 dígitos", () => {
    expect(() => PairingCode.issue("f1", "12345", now)).toThrow();
    expect(() => PairingCode.issue("f1", "12345a", now)).toThrow();
    expect(PairingCode.issue("f1", "000123", now).code).toBe("000123");
  });
});
