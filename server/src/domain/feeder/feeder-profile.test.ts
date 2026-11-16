import { describe, expect, it } from "vitest";
import { FeederProfile } from "./feeder-profile.js";

const props = {
  id: "f1",
  ownerId: "u1",
  nickname: "Cozinha",
  kind: "simulado" as const,
  createdAt: new Date("2026-11-16T12:00:00.000Z"),
};

describe("FeederProfile", () => {
  it("nasce com o apelido sem os espaços das pontas", () => {
    const profile = FeederProfile.create({ ...props, nickname: "  Sala  " });

    expect(profile.nickname).toBe("Sala");
  });

  it.each(["", "   ", "x".repeat(31)])(
    "recusa o apelido %j com apelido_invalido",
    (nickname) => {
      expect(() => FeederProfile.create({ ...props, nickname })).toThrow(
        expect.objectContaining({ codigo: "apelido_invalido" }),
      );
    },
  );

  it("aceita um apelido de 30 letras", () => {
    const nickname = "x".repeat(30);

    expect(FeederProfile.create({ ...props, nickname }).nickname).toBe(
      nickname,
    );
  });

  it("trocar o apelido passa pela mesma regra", () => {
    const profile = FeederProfile.create(props);

    profile.rename(" Quarto ");
    expect(profile.nickname).toBe("Quarto");
    expect(() => profile.rename("")).toThrow(
      expect.objectContaining({ codigo: "apelido_invalido" }),
    );
    expect(profile.nickname).toBe("Quarto");
  });

  it("sabe quem é o dono", () => {
    const profile = FeederProfile.create(props);

    expect(profile.isOwnedBy("u1")).toBe(true);
    expect(profile.isOwnedBy("u2")).toBe(false);
  });
});
