// Quem usa o app. A conta nasce no primeiro login com o Google e é atualizada a cada login.

// O que o provedor de login (Google) confirma sobre a pessoa.
export type Identity = {
  // O identificador estável da conta no Google. O e-mail pode mudar; o `sub`, não.
  sub: string;
  email: string;
  name: string;
  picture: string | null;
};

export type UserProps = {
  id: string;
  googleSub: string;
  email: string;
  name: string;
  picture: string | null;
  createdAt: Date;
};

export class User {
  private constructor(private props: UserProps) {}

  static create(id: string, identity: Identity, now: Date): User {
    return new User({
      id,
      googleSub: identity.sub,
      email: identity.email,
      name: displayName(identity),
      picture: identity.picture,
      createdAt: now,
    });
  }

  static restore(props: UserProps): User {
    return new User({ ...props });
  }

  // Traz o nome, o e-mail e a foto do login mais recente. Devolve true se algo mudou.
  updateFrom(identity: Identity): boolean {
    const next = {
      email: identity.email,
      name: displayName(identity),
      picture: identity.picture,
    };
    const changed =
      next.email !== this.props.email ||
      next.name !== this.props.name ||
      next.picture !== this.props.picture;
    if (changed) this.props = { ...this.props, ...next };
    return changed;
  }

  get id(): string {
    return this.props.id;
  }

  get googleSub(): string {
    return this.props.googleSub;
  }

  get email(): string {
    return this.props.email;
  }

  get name(): string {
    return this.props.name;
  }

  get picture(): string | null {
    return this.props.picture;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  toProps(): UserProps {
    return { ...this.props };
  }
}

// Sem nome no Google, usa o começo do e-mail: "ana.souza@gmail.com" vira "ana.souza".
function displayName(identity: Identity): string {
  const name = identity.name.trim();
  if (name) return name;
  return identity.email.split("@")[0] ?? identity.email;
}
