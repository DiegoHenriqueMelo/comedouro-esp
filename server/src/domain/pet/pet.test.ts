import { describe, expect, it } from "vitest";
import { Pet, type PetData } from "./pet.js";
import { PHOTO_MAX_BYTES, petPhoto } from "./pet-photo.js";

const TODAY = "2026-11-16";
const base = {
  id: "p1",
  ownerId: "u1",
  createdAt: new Date("2026-11-16T12:00:00.000Z"),
};
const mingau: PetData = {
  name: "Mingau",
  species: "gato",
  birthDate: "2023-05-10",
  weightKg: 4.2,
};

describe("Pet", () => {
  it("nasce com os dados, sem foto, e com o nome sem espaços nas pontas", () => {
    const pet = Pet.create(base, { ...mingau, name: "  Mingau " }, TODAY);

    expect(pet.toProps()).toEqual({
      ...base,
      ...mingau,
      photoVersion: null,
    });
  });

  it("nascimento e peso são opcionais", () => {
    const pet = Pet.create(
      base,
      { ...mingau, birthDate: null, weightKg: null },
      TODAY,
    );

    expect(pet.toProps().birthDate).toBeNull();
    expect(pet.toProps().weightKg).toBeNull();
  });

  it.each([
    [{ name: "" }, "nome_do_pet_invalido"],
    [{ name: "x".repeat(31) }, "nome_do_pet_invalido"],
    [{ species: "papagaio" }, "especie_invalida"],
    [{ birthDate: "2026-11-17" }, "nascimento_invalido"],
    [{ birthDate: "2026-02-30" }, "nascimento_invalido"],
    [{ birthDate: "10/05/2023" }, "nascimento_invalido"],
    [{ weightKg: 0 }, "peso_invalido"],
    [{ weightKg: 100.5 }, "peso_invalido"],
    [{ weightKg: Number.NaN }, "peso_invalido"],
  ])("recusa %o com %s", (change, codigo) => {
    expect(() =>
      Pet.create(base, { ...mingau, ...change } as PetData, TODAY),
    ).toThrow(expect.objectContaining({ codigo }));
  });

  it("aceita nascer hoje, e os extremos do peso", () => {
    expect(() =>
      Pet.create(base, { ...mingau, birthDate: TODAY, weightKg: 0.1 }, TODAY),
    ).not.toThrow();
    expect(() =>
      Pet.create(base, { ...mingau, weightKg: 100 }, TODAY),
    ).not.toThrow();
  });

  it("o peso fica com duas casas", () => {
    const pet = Pet.create(base, { ...mingau, weightKg: 4.256 }, TODAY);

    expect(pet.toProps().weightKg).toBe(4.26);
  });

  it("editar passa pelas mesmas regras e não mexe na foto", () => {
    const pet = Pet.create(base, mingau, TODAY);
    pet.photoChanged(3);

    pet.update({ ...mingau, name: "Mingau II" }, TODAY);
    expect(pet.name).toBe("Mingau II");
    expect(pet.photoVersion).toBe(3);

    expect(() => pet.update({ ...mingau, name: "" }, TODAY)).toThrow();
    expect(pet.name).toBe("Mingau II");
  });
});

describe("foto do pet", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  const webp = Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from("WEBPVP8 "),
  ]);

  it("aceita JPEG, PNG e WebP de verdade", () => {
    expect(petPhoto("image/jpeg", jpeg).contentType).toBe("image/jpeg");
    expect(petPhoto("image/png", png).contentType).toBe("image/png");
    expect(petPhoto("image/webp", webp).contentType).toBe("image/webp");
  });

  it("recusa tipo desconhecido, ou conteúdo que não bate com o tipo", () => {
    expect(() => petPhoto("image/gif", jpeg)).toThrow(
      expect.objectContaining({ codigo: "foto_invalida" }),
    );
    expect(() => petPhoto("image/jpeg", png)).toThrow(
      expect.objectContaining({ codigo: "foto_invalida" }),
    );
  });

  it("recusa foto acima do limite", () => {
    const big = Buffer.concat([jpeg, Buffer.alloc(PHOTO_MAX_BYTES)]);

    expect(() => petPhoto("image/jpeg", big)).toThrow(
      expect.objectContaining({ codigo: "foto_invalida" }),
    );
  });
});
