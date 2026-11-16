import { randomUUID } from "node:crypto";
import { Pet, type PetData } from "../domain/pet/pet.js";
import { type PetPhoto, petPhoto } from "../domain/pet/pet-photo.js";
import {
  ErroDeDominio,
  NaoEncontrado,
} from "../domain/shared/erro-de-dominio.js";
import type { Clock, PetPhotoRepository, PetRepository } from "./ports.js";

// D18: limite por conta, num serviço aberto.
export const MAX_PETS = 20;

// O formato que a API devolve. A foto vira um endereço; o `?v=` muda a cada foto nova.
export type PetDto = {
  id: string;
  nome: string;
  especie: string;
  nascimento: string | null;
  pesoKg: number | null;
  foto: string | null;
  criadoEm: string;
};

export function toPetDto(pet: Pet): PetDto {
  const p = pet.toProps();
  return {
    id: p.id,
    nome: p.name,
    especie: p.species,
    nascimento: p.birthDate,
    pesoKg: p.weightKg,
    foto:
      p.photoVersion === null
        ? null
        : `/v1/pets/${encodeURIComponent(p.id)}/foto?v=${p.photoVersion}`,
    criadoEm: p.createdAt.toISOString(),
  };
}

// Os pets de cada conta. Pet de outra conta é "não encontrado" (D17).
export class PetService {
  constructor(
    private readonly pets: PetRepository,
    private readonly photos: PetPhotoRepository,
    private readonly clock: Clock,
  ) {}

  async list(ownerId: string): Promise<Pet[]> {
    const pets = await this.pets.listByOwner(ownerId);
    return [...pets].sort((a, b) =>
      a.toProps().createdAt < b.toProps().createdAt ? -1 : 1,
    );
  }

  async get(ownerId: string, petId: string): Promise<Pet> {
    const pet = await this.pets.findById(petId);
    if (pet === null || !pet.isOwnedBy(ownerId)) throw new NaoEncontrado();
    return pet;
  }

  async create(ownerId: string, data: PetData): Promise<Pet> {
    const mine = await this.pets.listByOwner(ownerId);
    if (mine.length >= MAX_PETS) {
      throw new ErroDeDominio(
        "limite_de_pets",
        `cada conta tem no máximo ${MAX_PETS} pets`,
      );
    }
    const now = this.clock.now();
    const pet = Pet.create(
      { id: randomUUID(), ownerId, createdAt: now },
      data,
      today(now),
    );
    await this.pets.save(pet);
    return pet;
  }

  async update(ownerId: string, petId: string, data: PetData): Promise<Pet> {
    const pet = await this.get(ownerId, petId);
    pet.update(data, today(this.clock.now()));
    await this.pets.save(pet);
    return pet;
  }

  async remove(ownerId: string, petId: string): Promise<void> {
    await this.get(ownerId, petId);
    await this.photos.remove(petId);
    await this.pets.remove(petId);
  }

  async setPhoto(
    ownerId: string,
    petId: string,
    contentType: string,
    data: Buffer,
  ): Promise<Pet> {
    const pet = await this.get(ownerId, petId);
    const photo = petPhoto(contentType, data);
    await this.photos.save(petId, photo);
    pet.photoChanged(this.clock.now().getTime());
    await this.pets.save(pet);
    return pet;
  }

  async getPhoto(ownerId: string, petId: string): Promise<PetPhoto> {
    await this.get(ownerId, petId);
    const photo = await this.photos.get(petId);
    if (!photo) throw new NaoEncontrado();
    return photo;
  }

  async removePhoto(ownerId: string, petId: string): Promise<Pet> {
    const pet = await this.get(ownerId, petId);
    await this.photos.remove(petId);
    pet.photoRemoved();
    await this.pets.save(pet);
    return pet;
  }
}

// A data de hoje, AAAA-MM-DD, em UTC. No Brasil, à noite, já é "amanhã" em UTC: a folga é de um dia
// a mais para o nascimento, nunca de um dia a menos.
function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}
