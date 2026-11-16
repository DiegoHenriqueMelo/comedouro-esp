import { ErroDeDominio } from "../shared/erro-de-dominio.js";

// De quem é o comedouro, como ele se chama e se é um aparelho de verdade.
// Fica separado do `Feeder` de propósito: o `Feeder` guarda as regras da agenda (R1–R12), que valem
// para qualquer dono; trocar o apelido não pode disputar versão com quem está salvando a agenda.

export type FeederKind = "aparelho" | "simulado";

export type FeederProfileProps = {
  id: string;
  ownerId: string;
  nickname: string;
  kind: FeederKind;
  createdAt: Date;
};

export class FeederProfile {
  static readonly NICKNAME_MAX = 30;

  private constructor(private props: FeederProfileProps) {}

  static create(props: FeederProfileProps): FeederProfile {
    return new FeederProfile({
      ...props,
      nickname: FeederProfile.validNickname(props.nickname),
    });
  }

  static restore(props: FeederProfileProps): FeederProfile {
    return new FeederProfile({ ...props });
  }

  rename(nickname: string): void {
    this.props = {
      ...this.props,
      nickname: FeederProfile.validNickname(nickname),
    };
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

  get nickname(): string {
    return this.props.nickname;
  }

  get kind(): FeederKind {
    return this.props.kind;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  toProps(): FeederProfileProps {
    return { ...this.props };
  }

  // O apelido aparece nas frases ("Cozinha serviu às 12:30"): não pode ser vazio nem enorme.
  private static validNickname(nickname: string): string {
    const trimmed = nickname.trim();
    if (trimmed.length === 0 || trimmed.length > FeederProfile.NICKNAME_MAX) {
      throw new ErroDeDominio(
        "apelido_invalido",
        `o apelido precisa ter de 1 a ${FeederProfile.NICKNAME_MAX} letras; recebido: ${trimmed.length}`,
      );
    }
    return trimmed;
  }
}
