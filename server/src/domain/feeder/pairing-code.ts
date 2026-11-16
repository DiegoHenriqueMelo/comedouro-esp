import { ErroDeDominio } from "../shared/erro-de-dominio.js";

// O código de 6 dígitos que liga um aparelho a um comedouro (D4, D14).
// A pessoa vê o código no app e digita no portal Wi-Fi do ESP32; o ESP32 troca o código pela senha MQTT.

export type PairingCodeProps = {
  code: string;
  feederId: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export class PairingCode {
  static readonly TTL_MINUTES = 10;

  private constructor(private props: PairingCodeProps) {}

  static issue(feederId: string, code: string, now: Date): PairingCode {
    if (!/^\d{6}$/.test(code)) {
      throw new Error(`código de pareamento fora do formato: ${code}`);
    }
    return new PairingCode({
      code,
      feederId,
      expiresAt: new Date(now.getTime() + PairingCode.TTL_MINUTES * 60_000),
      usedAt: null,
    });
  }

  static restore(props: PairingCodeProps): PairingCode {
    return new PairingCode({ ...props });
  }

  // Vale uma vez só, e só até vencer.
  isActiveAt(now: Date): boolean {
    return (
      this.props.usedAt === null &&
      now.getTime() < this.props.expiresAt.getTime()
    );
  }

  use(now: Date): void {
    if (!this.isActiveAt(now)) {
      // A mensagem não diz se o código venceu, já foi usado ou nunca existiu: não ajuda quem chuta.
      throw new ErroDeDominio("codigo_invalido", "código inválido ou vencido");
    }
    this.props = { ...this.props, usedAt: now };
  }

  get code(): string {
    return this.props.code;
  }

  get feederId(): string {
    return this.props.feederId;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  toProps(): PairingCodeProps {
    return { ...this.props };
  }
}
