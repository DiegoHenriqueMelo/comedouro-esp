import { ErroDeDominio } from "../shared/erro-de-dominio.js";

// O pet é só um cadastro (D5): não tem vínculo com comedouro, porque o comedouro não sabe quem comeu.

export const SPECIES = ["gato", "cachorro"] as const;
export type Species = (typeof SPECIES)[number];

// O que a pessoa preenche. Nascimento no formato AAAA-MM-DD; peso em quilos.
export type PetData = {
  name: string;
  species: Species;
  birthDate: string | null;
  weightKg: number | null;
};

export type PetProps = PetData & {
  id: string;
  ownerId: string;
  // Muda a cada foto nova: o app usa no endereço da foto, para o navegador não mostrar a antiga.
  photoVersion: number | null;
  createdAt: Date;
};

export class Pet {
  static readonly NAME_MAX = 30;
  static readonly WEIGHT_MIN = 0.1;
  static readonly WEIGHT_MAX = 100;

  private constructor(private props: PetProps) {}

  // `today` é a data de hoje (AAAA-MM-DD): o nascimento não pode estar no futuro.
  static create(
    base: { id: string; ownerId: string; createdAt: Date },
    data: PetData,
    today: string,
  ): Pet {
    return new Pet({
      ...base,
      ...Pet.valid(data, today),
      photoVersion: null,
    });
  }

  static restore(props: PetProps): Pet {
    return new Pet({ ...props });
  }

  update(data: PetData, today: string): void {
    this.props = { ...this.props, ...Pet.valid(data, today) };
  }

  photoChanged(version: number): void {
    this.props = { ...this.props, photoVersion: version };
  }

  photoRemoved(): void {
    this.props = { ...this.props, photoVersion: null };
  }

  isOwnedBy(userId: string): boolean {
    return this.props.ownerId === userId;
  }

  get id(): string {
    return this.props.id;
  }

  get ownerId(): string {
    return this.props.ownerId;
  }

  get name(): string {
    return this.props.name;
  }

  get photoVersion(): number | null {
    return this.props.photoVersion;
  }

  toProps(): PetProps {
    return { ...this.props };
  }

  private static valid(data: PetData, today: string): PetData {
    const name = data.name.trim();
    if (name.length === 0 || name.length > Pet.NAME_MAX) {
      throw new ErroDeDominio(
        "nome_do_pet_invalido",
        `o nome precisa ter de 1 a ${Pet.NAME_MAX} letras; recebido: ${name.length}`,
      );
    }

    if (!SPECIES.includes(data.species)) {
      throw new ErroDeDominio(
        "especie_invalida",
        `espécie desconhecida: ${String(data.species)}`,
      );
    }

    if (data.birthDate !== null) {
      if (!isRealDate(data.birthDate) || data.birthDate > today) {
        throw new ErroDeDominio(
          "nascimento_invalido",
          `o nascimento precisa ser uma data até hoje (${today}); recebido: ${data.birthDate}`,
        );
      }
    }

    if (data.weightKg !== null) {
      const w = data.weightKg;
      if (!Number.isFinite(w) || w < Pet.WEIGHT_MIN || w > Pet.WEIGHT_MAX) {
        throw new ErroDeDominio(
          "peso_invalido",
          `o peso vai de ${Pet.WEIGHT_MIN} a ${Pet.WEIGHT_MAX} kg; recebido: ${w}`,
        );
      }
    }

    return {
      name,
      species: data.species,
      birthDate: data.birthDate,
      weightKg:
        data.weightKg === null ? null : Math.round(data.weightKg * 100) / 100,
    };
  }
}

// "2026-02-30" tem o formato certo, mas não existe.
function isRealDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}
