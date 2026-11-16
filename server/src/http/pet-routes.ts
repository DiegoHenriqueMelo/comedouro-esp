import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { type PetService, toPetDto } from "../application/pet-service.js";
import type { PetData } from "../domain/pet/pet.js";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "../domain/pet/pet-photo.js";

// A forma do dado (400). O sentido (nome vazio, nascimento no futuro) é do domínio (422).
const petSchema = z.object({
  nome: z.string().max(200),
  especie: z.string().max(40),
  nascimento: z.string().max(40).nullable().default(null),
  pesoKg: z.number().nullable().default(null),
});

function toPetData(body: z.infer<typeof petSchema>): PetData {
  return {
    name: body.nome,
    species: body.especie as PetData["species"],
    birthDate: body.nascimento,
    weightKg: body.pesoKg,
  };
}

function ownerOf(request: FastifyRequest): string {
  if (!request.user) throw new Error("rota com sessão chamada sem usuário");
  return request.user.id;
}

const idOf = (request: FastifyRequest) => (request.params as { id: string }).id;

export function registerPetRoutes(pets: PetService) {
  return async (app: FastifyInstance) => {
    // A foto chega como a própria imagem, não como JSON. Acima do limite, o Fastify responde 413.
    app.addContentTypeParser(
      [...PHOTO_TYPES],
      { parseAs: "buffer", bodyLimit: PHOTO_MAX_BYTES },
      (_request, body, done) => done(null, body),
    );

    app.get("/pets", async (request) =>
      (await pets.list(ownerOf(request))).map(toPetDto),
    );

    app.post("/pets", async (request, reply) => {
      const data = toPetData(petSchema.parse(request.body));
      const pet = await pets.create(ownerOf(request), data);
      return reply.code(201).send(toPetDto(pet));
    });

    app.get("/pets/:id", async (request) =>
      toPetDto(await pets.get(ownerOf(request), idOf(request))),
    );

    app.put("/pets/:id", async (request) => {
      const data = toPetData(petSchema.parse(request.body));
      return toPetDto(await pets.update(ownerOf(request), idOf(request), data));
    });

    app.delete("/pets/:id", async (request, reply) => {
      await pets.remove(ownerOf(request), idOf(request));
      return reply.code(204).send();
    });

    app.put("/pets/:id/foto", async (request) => {
      const contentType = (request.headers["content-type"] ?? "")
        .split(";")[0]
        ?.trim();
      const body = Buffer.isBuffer(request.body)
        ? request.body
        : Buffer.alloc(0);
      const pet = await pets.setPhoto(
        ownerOf(request),
        idOf(request),
        contentType ?? "",
        body,
      );
      return toPetDto(pet);
    });

    app.get("/pets/:id/foto", async (request, reply) => {
      const photo = await pets.getPhoto(ownerOf(request), idOf(request));
      // O endereço muda a cada foto nova (?v=), então o navegador pode guardar à vontade.
      return reply
        .header("Content-Type", photo.contentType)
        .header("Cache-Control", "private, max-age=31536000, immutable")
        .send(photo.data);
    });

    app.delete("/pets/:id/foto", async (request) =>
      toPetDto(await pets.removePhoto(ownerOf(request), idOf(request))),
    );
  };
}
