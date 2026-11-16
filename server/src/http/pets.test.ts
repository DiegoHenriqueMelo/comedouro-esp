import { afterEach, describe, expect, it } from "vitest";
import { PHOTO_MAX_BYTES } from "../domain/pet/pet-photo.js";
import { buildTestSystem } from "../test-support.js";

type TestSystem = Awaited<ReturnType<typeof buildTestSystem>>;

const BIA = {
  sub: "google-bia",
  email: "bia@example.com",
  name: "Bia",
  picture: null,
};

const mingau = {
  nome: "Mingau",
  especie: "gato",
  nascimento: "2023-05-10",
  pesoKg: 4.2,
};

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);

describe("pets", () => {
  let t: TestSystem;

  afterEach(async () => {
    await t.system.catalog.close();
    await t.app.close();
  });

  const create = (payload: object = mingau) =>
    t.inject({ method: "POST", url: "/v1/pets", payload });

  it("cadastra, lista, edita e remove", async () => {
    t = await buildTestSystem();

    const created = await create();
    expect(created.statusCode).toBe(201);
    const pet = created.json();
    expect(pet).toEqual({
      id: expect.any(String),
      nome: "Mingau",
      especie: "gato",
      nascimento: "2023-05-10",
      pesoKg: 4.2,
      foto: null,
      criadoEm: expect.any(String),
    });

    const list = await t.inject({ method: "GET", url: "/v1/pets" });
    expect(list.json()).toEqual([pet]);

    const edited = await t.inject({
      method: "PUT",
      url: `/v1/pets/${pet.id}`,
      payload: { ...mingau, pesoKg: 4.5, nascimento: null },
    });
    expect(edited.json()).toMatchObject({ pesoKg: 4.5, nascimento: null });

    const removed = await t.inject({
      method: "DELETE",
      url: `/v1/pets/${pet.id}`,
    });
    expect(removed.statusCode).toBe(204);
    expect((await t.inject({ method: "GET", url: "/v1/pets" })).json()).toEqual(
      [],
    );
  });

  it("nascimento e peso podem ficar de fora", async () => {
    t = await buildTestSystem();

    const res = await create({ nome: "Paçoca", especie: "cachorro" });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ nascimento: null, pesoKg: null });
  });

  it.each([
    [{ nome: "" }, "nome_do_pet_invalido"],
    [{ nome: "x".repeat(31) }, "nome_do_pet_invalido"],
    [{ especie: "papagaio" }, "especie_invalida"],
    [{ nascimento: "2026-11-11" }, "nascimento_invalido"],
    [{ pesoKg: 0 }, "peso_invalido"],
  ])("recusa %o com 422 %s", async (change, motivo) => {
    // O relógio dos testes está em 10/11/2026: o dia 11 é amanhã.
    t = await buildTestSystem();

    const res = await create({ ...mingau, ...change });

    expect(res.statusCode).toBe(422);
    expect(res.json().motivo).toBe(motivo);
  });

  describe("acentos", () => {
    const raw = (body: Buffer) =>
      t.inject({
        method: "POST",
        url: "/v1/pets",
        payload: body,
        headers: { "content-type": "application/json" },
      });

    it("o nome com ç e acento, em UTF-8, chega inteiro", async () => {
      t = await buildTestSystem();

      const res = await raw(
        Buffer.from(JSON.stringify({ nome: "Paçoca Ü", especie: "cachorro" })),
      );

      expect(res.statusCode).toBe(201);
      expect(res.json().nome).toBe("Paçoca Ü");
    });

    it("bytes que não são UTF-8 (o ç em Latin-1): 400 texto_invalido, e nada é salvo", async () => {
      t = await buildTestSystem();

      const res = await raw(
        Buffer.from('{"nome":"Paçoca","especie":"cachorro"}', "latin1"),
      );

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ motivo: "texto_invalido" });
      expect(
        (await t.inject({ method: "GET", url: "/v1/pets" })).json(),
      ).toEqual([]);
    });

    it("JSON quebrado: 400 texto_invalido", async () => {
      t = await buildTestSystem();

      const res = await raw(Buffer.from('{"nome": '));

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ motivo: "texto_invalido" });
    });
  });

  it("forma errada (peso em texto) é 400", async () => {
    t = await buildTestSystem();

    const res = await create({ ...mingau, pesoKg: "quatro" });

    expect(res.statusCode).toBe(400);
  });

  it("o 21º pet da conta: 422 limite_de_pets", async () => {
    t = await buildTestSystem();
    for (let i = 1; i <= 20; i++) {
      expect((await create({ ...mingau, nome: `Pet ${i}` })).statusCode).toBe(
        201,
      );
    }

    const res = await create();

    expect(res.statusCode).toBe(422);
    expect(res.json().motivo).toBe("limite_de_pets");
  });

  describe("foto", () => {
    const upload = (id: string, body: Buffer, type = "image/jpeg") =>
      t.inject({
        method: "PUT",
        url: `/v1/pets/${id}/foto`,
        payload: body,
        headers: { "content-type": type },
      });

    it("envia, mostra e apaga; o endereço muda a cada foto nova", async () => {
      t = await buildTestSystem();
      const pet = (await create()).json();

      const first = await upload(pet.id, JPEG);
      expect(first.statusCode).toBe(200);
      const url = first.json().foto as string;
      expect(url).toMatch(new RegExp(`^/v1/pets/${pet.id}/foto\\?v=\\d+$`));

      const image = await t.inject({ method: "GET", url });
      expect(image.statusCode).toBe(200);
      expect(image.headers["content-type"]).toBe("image/jpeg");
      expect(image.rawPayload.equals(JPEG)).toBe(true);

      t.clock.advanceMinutes(1);
      const second = await upload(pet.id, JPEG);
      expect(second.json().foto).not.toBe(url);

      const deleted = await t.inject({
        method: "DELETE",
        url: `/v1/pets/${pet.id}/foto`,
      });
      expect(deleted.json().foto).toBeNull();
      expect(
        (await t.inject({ method: "GET", url: `/v1/pets/${pet.id}/foto` }))
          .statusCode,
      ).toBe(404);
    });

    it("um arquivo que não é imagem: 422 foto_invalida", async () => {
      t = await buildTestSystem();
      const pet = (await create()).json();

      const res = await upload(pet.id, Buffer.from("não sou uma foto"));

      expect(res.statusCode).toBe(422);
      expect(res.json().motivo).toBe("foto_invalida");
    });

    it("um tipo que não é imagem: 415", async () => {
      t = await buildTestSystem();
      const pet = (await create()).json();

      const res = await upload(pet.id, JPEG, "application/pdf");

      expect(res.statusCode).toBe(415);
    });

    it("acima do limite: 413", async () => {
      t = await buildTestSystem();
      const pet = (await create()).json();

      const res = await upload(
        pet.id,
        Buffer.concat([JPEG, Buffer.alloc(PHOTO_MAX_BYTES)]),
      );

      expect(res.statusCode).toBe(413);
      expect(res.json()).toEqual({ motivo: "grande_demais" });
    });

    it("remover o pet apaga a foto", async () => {
      t = await buildTestSystem();
      const pet = (await create()).json();
      await upload(pet.id, JPEG);

      await t.inject({ method: "DELETE", url: `/v1/pets/${pet.id}` });

      expect(t.petPhotos.has(pet.id)).toBe(false);
    });
  });

  describe("cada conta só enxerga os seus (D17)", () => {
    it("outra conta não vê, não edita, não remove e não vê a foto", async () => {
      t = await buildTestSystem();
      const pet = (await create()).json();
      await t.inject({
        method: "PUT",
        url: `/v1/pets/${pet.id}/foto`,
        payload: JPEG,
        headers: { "content-type": "image/jpeg" },
      });
      const bia = await t.loginAs(BIA);
      const as = (method: "GET" | "PUT" | "DELETE", url: string) =>
        t.injectAs(bia.cookie, {
          method,
          url,
          ...(method === "PUT" ? { payload: mingau } : {}),
        });

      expect((await as("GET", "/v1/pets")).json()).toEqual([]);
      for (const [method, url] of [
        ["GET", `/v1/pets/${pet.id}`],
        ["PUT", `/v1/pets/${pet.id}`],
        ["DELETE", `/v1/pets/${pet.id}`],
        ["GET", `/v1/pets/${pet.id}/foto`],
        ["DELETE", `/v1/pets/${pet.id}/foto`],
      ] as const) {
        const res = await as(method, url);
        expect(res.statusCode, `${method} ${url}`).toBe(404);
      }
      expect(await t.pets.findById(pet.id)).not.toBeNull();
      expect(t.petPhotos.has(pet.id)).toBe(true);
    });

    it("sem sessão: 401", async () => {
      t = await buildTestSystem();

      const res = await t.app.inject({ method: "GET", url: "/v1/pets" });

      expect(res.statusCode).toBe(401);
    });
  });
});
