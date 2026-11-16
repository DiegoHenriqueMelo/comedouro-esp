import {
  type ConfigDto,
  fromConfigDto,
  fromScheduleDto,
  type ScheduleItemDto,
  toConfigDto,
  toScheduleDto,
} from "../../application/dto.js";
import type {
  Alert,
  AlertRepository,
  AlertType,
  DeviceCredential,
  DeviceCredentialRepository,
  DeviceEventRepository,
  DeviceStatusRepository,
  FeederProfileRepository,
  FeederRepositories,
  FeederRepository,
  FeederStorage,
  IdentityVerifier,
  PushSubscription,
  PushSubscriptionRepository,
  Session,
  SessionRepository,
  UserNotifier,
  UserRepository,
} from "../../application/ports.js";
import type { DeviceEvent, DeviceStatus } from "../../domain/device/device.js";
import { Feeder } from "../../domain/feeder/feeder.js";
import {
  FeederProfile,
  type FeederProfileProps,
} from "../../domain/feeder/feeder-profile.js";
import { ErroDeDominio } from "../../domain/shared/erro-de-dominio.js";
import { type Identity, User } from "../../domain/user/user.js";

// Adaptadores em memória: para os testes e para rodar sem banco (os dados somem ao reiniciar).

type FeederSnapshot = {
  version: number;
  config: ConfigDto;
  schedule: ScheduleItemDto[];
};

export class MemoryFeederRepository implements FeederRepository {
  // Guarda uma cópia, nunca a referência do objeto: mexer no Feeder depois de salvar não muda o que está salvo.
  private saved: FeederSnapshot | null = null;

  async load(): Promise<Feeder | null> {
    if (!this.saved) return null;
    return Feeder.restore(
      fromScheduleDto(this.saved.schedule),
      fromConfigDto(this.saved.config),
      this.saved.version,
    );
  }

  async save(feeder: Feeder, expectedVersion: number | null): Promise<void> {
    const current = this.saved?.version ?? null;
    if (current !== expectedVersion) {
      throw new ErroDeDominio(
        "conflito_de_versao",
        `a versão salva é ${current}, e a esperada era ${expectedVersion}`,
      );
    }
    this.saved = {
      version: feeder.version,
      config: toConfigDto(feeder.configuration),
      schedule: toScheduleDto(feeder.schedule),
    };
  }
}

export class MemoryDeviceEventRepository implements DeviceEventRepository {
  private readonly bySeq = new Map<number, DeviceEvent>();

  async add(event: DeviceEvent): Promise<boolean> {
    if (this.bySeq.has(event.seq)) return false;
    this.bySeq.set(event.seq, { ...event });
    return true;
  }

  async list(limit: number): Promise<DeviceEvent[]> {
    return [...this.bySeq.values()]
      .sort((a, b) => b.at.getTime() - a.at.getTime() || b.seq - a.seq)
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  async lastSeq(): Promise<number> {
    return Math.max(0, ...this.bySeq.keys());
  }
}

export class MemoryDeviceStatusRepository implements DeviceStatusRepository {
  private status: DeviceStatus = {
    online: false,
    onlineChangedAt: null,
    state: null,
  };

  async load(): Promise<DeviceStatus> {
    return { ...this.status };
  }

  async save(status: DeviceStatus): Promise<void> {
    this.status = { ...status };
  }
}

export class MemoryAlertRepository implements AlertRepository {
  private readonly openAlerts = new Map<AlertType, Alert>();

  async listOpen(): Promise<Alert[]> {
    return [...this.openAlerts.values()].map((a) => ({ ...a }));
  }

  async open(alert: Alert): Promise<boolean> {
    if (this.openAlerts.has(alert.type)) return false;
    this.openAlerts.set(alert.type, { ...alert });
    return true;
  }

  async markNotified(type: AlertType, at: Date): Promise<void> {
    const alert = this.openAlerts.get(type);
    if (alert) alert.notifiedAt = at;
  }

  async close(type: AlertType): Promise<void> {
    this.openAlerts.delete(type);
  }
}

export class MemoryPushSubscriptionRepository
  implements PushSubscriptionRepository
{
  private readonly byEndpoint = new Map<
    string,
    { userId: string; subscription: PushSubscription }
  >();

  async add(userId: string, subscription: PushSubscription): Promise<void> {
    this.byEndpoint.set(subscription.endpoint, { userId, subscription });
  }

  async listByUser(userId: string): Promise<PushSubscription[]> {
    return [...this.byEndpoint.values()]
      .filter((entry) => entry.userId === userId)
      .map((entry) => entry.subscription);
  }

  async remove(endpoint: string): Promise<void> {
    this.byEndpoint.delete(endpoint);
  }
}

export class MemoryUserRepository implements UserRepository {
  private readonly byId = new Map<string, ReturnType<User["toProps"]>>();

  async findById(id: string): Promise<User | null> {
    const props = this.byId.get(id);
    return props ? User.restore(props) : null;
  }

  async findByGoogleSub(sub: string): Promise<User | null> {
    for (const props of this.byId.values()) {
      if (props.googleSub === sub) return User.restore(props);
    }
    return null;
  }

  async save(user: User): Promise<void> {
    this.byId.set(user.id, user.toProps());
  }
}

export class MemorySessionRepository implements SessionRepository {
  private readonly byHash = new Map<string, Session>();

  async add(session: Session): Promise<void> {
    this.byHash.set(session.tokenHash, { ...session });
  }

  async find(tokenHash: string): Promise<Session | null> {
    const session = this.byHash.get(tokenHash);
    return session ? { ...session } : null;
  }

  async update(session: Session): Promise<void> {
    if (this.byHash.has(session.tokenHash)) {
      this.byHash.set(session.tokenHash, { ...session });
    }
  }

  async remove(tokenHash: string): Promise<void> {
    this.byHash.delete(tokenHash);
  }
}

// O "Google" dos testes: cada credencial cadastrada vale por uma identidade; o resto é recusado.
export class FakeIdentityVerifier implements IdentityVerifier {
  private readonly identities = new Map<string, Identity>();

  accept(credential: string, identity: Identity): void {
    this.identities.set(credential, identity);
  }

  async verify(credential: string): Promise<Identity | null> {
    return this.identities.get(credential) ?? null;
  }
}

// Guarda as notificações numa lista, para os testes.
export class MemoryNotifier implements UserNotifier {
  readonly sent: { userId: string; title: string; body: string }[] = [];

  async notify(userId: string, title: string, body: string): Promise<void> {
    this.sent.push({ userId, title, body });
  }
}

export class MemoryFeederProfileRepository implements FeederProfileRepository {
  private readonly byId = new Map<string, FeederProfileProps>();

  async findById(id: string): Promise<FeederProfile | null> {
    const props = this.byId.get(id);
    return props ? FeederProfile.restore(props) : null;
  }

  async listByOwner(ownerId: string): Promise<FeederProfile[]> {
    return (await this.listAll()).filter((p) => p.ownerId === ownerId);
  }

  async listAll(): Promise<FeederProfile[]> {
    return [...this.byId.values()].map((p) => FeederProfile.restore(p));
  }

  async save(profile: FeederProfile): Promise<void> {
    this.byId.set(profile.id, profile.toProps());
  }

  async remove(id: string): Promise<void> {
    this.byId.delete(id);
  }
}

// Um conjunto de repositórios em memória para cada comedouro.
export class MemoryFeederStorage implements FeederStorage {
  private readonly byFeeder = new Map<string, FeederRepositories>();

  forFeeder(feederId: string): FeederRepositories {
    let repositories = this.byFeeder.get(feederId);
    if (!repositories) {
      repositories = {
        feeder: new MemoryFeederRepository(),
        events: new MemoryDeviceEventRepository(),
        status: new MemoryDeviceStatusRepository(),
        alerts: new MemoryAlertRepository(),
      };
      this.byFeeder.set(feederId, repositories);
    }
    return repositories;
  }

  async purge(feederId: string): Promise<void> {
    this.byFeeder.delete(feederId);
  }

  has(feederId: string): boolean {
    return this.byFeeder.has(feederId);
  }
}

export class MemoryDeviceCredentialRepository
  implements DeviceCredentialRepository
{
  private readonly byUsername = new Map<string, DeviceCredential>();

  async findByUsername(username: string): Promise<DeviceCredential | null> {
    const credential = this.byUsername.get(username);
    return credential ? { ...credential } : null;
  }

  async save(credential: DeviceCredential): Promise<void> {
    this.byUsername.set(credential.username, { ...credential });
  }

  async removeByFeeder(feederId: string): Promise<void> {
    for (const [username, credential] of this.byUsername) {
      if (credential.feederId === feederId) this.byUsername.delete(username);
    }
  }
}

export class FixedClock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }

  set(date: Date): void {
    this.current = date;
  }
}

export const systemClock = { now: () => new Date() };
