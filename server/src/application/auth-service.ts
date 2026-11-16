import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type Identity, User } from "../domain/user/user.js";
import type {
  Clock,
  IdentityVerifier,
  SessionRepository,
  UserRepository,
} from "./ports.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_DAYS = 30;

// A pessoa de mentira do "Entrar como dev", que só existe fora de produção.
export const DEV_IDENTITY: Identity = {
  sub: "dev",
  email: "dev@localhost",
  name: "Dev",
  picture: null,
};

export type LoginResult = { user: User; token: string };

// Login e sessão. O app manda a credencial do Google uma vez; daí em diante, vale o cookie da sessão.
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    // null quando o login com Google não foi configurado (sem GOOGLE_CLIENT_ID).
    private readonly verifier: IdentityVerifier | null,
    private readonly clock: Clock,
  ) {}

  get googleEnabled(): boolean {
    return this.verifier !== null;
  }

  // Devolve null se a credencial não vale (ou se o login com Google está desligado).
  async loginWithGoogle(credential: string): Promise<LoginResult | null> {
    if (!this.verifier) return null;
    const identity = await this.verifier.verify(credential);
    if (!identity) return null;
    return this.loginAs(identity);
  }

  // Acha a conta pelo `sub` (ou cria no primeiro login) e abre uma sessão nova.
  async loginAs(identity: Identity): Promise<LoginResult> {
    const now = this.clock.now();
    let user = await this.users.findByGoogleSub(identity.sub);
    if (!user) {
      user = User.create(randomUUID(), identity, now);
      await this.users.save(user);
    } else if (user.updateFrom(identity)) {
      await this.users.save(user);
    }

    const token = randomBytes(32).toString("base64url");
    await this.sessions.add({
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS),
      renewedAt: now,
    });
    return { user, token };
  }

  // Quem é o dono deste token? null se a sessão não existe ou venceu.
  // Uma sessão em uso é renovada (no máximo uma vez por dia): só sai quem fica 30 dias sem abrir o app.
  async authenticate(token: string | undefined): Promise<User | null> {
    if (!token) return null;
    const now = this.clock.now();
    const session = await this.sessions.find(hashToken(token));
    if (!session) return null;
    if (session.expiresAt.getTime() <= now.getTime()) {
      await this.sessions.remove(session.tokenHash);
      return null;
    }

    const user = await this.users.findById(session.userId);
    if (!user) {
      await this.sessions.remove(session.tokenHash);
      return null;
    }

    if (now.getTime() - session.renewedAt.getTime() >= DAY_MS) {
      await this.sessions.update({
        ...session,
        expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY_MS),
        renewedAt: now,
      });
    }
    return user;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.sessions.remove(hashToken(token));
  }
}

// O banco guarda só o hash: quem ler o banco não consegue usar a sessão de ninguém.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
