import { Binary, type Collection, type Db, MongoServerError } from "mongodb";
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
  PairingCodeRepository,
  PetPhotoRepository,
  PetRepository,
  PushSubscription,
  PushSubscriptionRepository,
  Session,
  SessionRepository,
  UserRepository,
} from "../../application/ports.js";
import type {
  DeviceEvent,
  DeviceState,
  DeviceStatus,
} from "../../domain/device/device.js";
import { Feeder } from "../../domain/feeder/feeder.js";
import {
  FeederProfile,
  type FeederProfileProps,
} from "../../domain/feeder/feeder-profile.js";
import {
  PairingCode,
  type PairingCodeProps,
} from "../../domain/feeder/pairing-code.js";
import { Pet, type PetProps } from "../../domain/pet/pet.js";
import type { PetPhoto, PhotoType } from "../../domain/pet/pet-photo.js";
import { ErroDeDominio } from "../../domain/shared/erro-de-dominio.js";
import { User, type UserProps } from "../../domain/user/user.js";

// Adaptadores do MongoDB. Cada repositório devolve objetos do domínio; o formato do documento não sai daqui.

const DUPLICATE_KEY = 11000;

function isDuplicateKey(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === DUPLICATE_KEY;
}

type FeederDoc = {
  _id: string;
  version: number;
  config: ConfigDto;
  schedule: ScheduleItemDto[];
  updatedAt: Date;
};

export class MongoFeederRepository implements FeederRepository {
  private readonly collection: Collection<FeederDoc>;

  constructor(
    db: Db,
    private readonly feederId: string,
  ) {
    this.collection = db.collection<FeederDoc>("feeders");
  }

  async load(): Promise<Feeder | null> {
    const doc = await this.collection.findOne({ _id: this.feederId });
    if (!doc) return null;
    return Feeder.restore(
      fromScheduleDto(doc.schedule),
      fromConfigDto(doc.config),
      doc.version,
    );
  }

  // Concorrência otimista: só grava se a versão no banco ainda for a que foi carregada.
  async save(feeder: Feeder, expectedVersion: number | null): Promise<void> {
    const doc: FeederDoc = {
      _id: this.feederId,
      version: feeder.version,
      config: toConfigDto(feeder.configuration),
      schedule: toScheduleDto(feeder.schedule),
      updatedAt: new Date(),
    };

    if (expectedVersion === null) {
      try {
        await this.collection.insertOne(doc);
        return;
      } catch (err) {
        if (isDuplicateKey(err)) throw conflict(expectedVersion);
        throw err;
      }
    }

    const result = await this.collection.replaceOne(
      { _id: this.feederId, version: expectedVersion },
      doc,
    );
    if (result.matchedCount === 0) throw conflict(expectedVersion);
  }
}

function conflict(expectedVersion: number | null): ErroDeDominio {
  return new ErroDeDominio(
    "conflito_de_versao",
    `o alimentador foi alterado por outra pessoa; a versão esperada era ${expectedVersion}`,
  );
}

type EventDoc = Omit<DeviceEvent, "seq"> & { feederId: string; seq: number };

export class MongoDeviceEventRepository implements DeviceEventRepository {
  private readonly collection: Collection<EventDoc>;

  constructor(
    db: Db,
    private readonly feederId: string,
  ) {
    this.collection = db.collection<EventDoc>("device_events");
  }

  async ensureIndexes(): Promise<void> {
    // O índice único é o que garante a idempotência: o mesmo `seq` não entra duas vezes.
    await this.collection.createIndex(
      { feederId: 1, seq: 1 },
      { unique: true },
    );
    await this.collection.createIndex({ feederId: 1, at: -1 });
  }

  async add(event: DeviceEvent): Promise<boolean> {
    try {
      await this.collection.insertOne({ ...event, feederId: this.feederId });
      return true;
    } catch (err) {
      if (isDuplicateKey(err)) return false;
      throw err;
    }
  }

  async list(limit: number): Promise<DeviceEvent[]> {
    const docs = await this.collection
      .find(
        { feederId: this.feederId },
        { projection: { _id: 0, feederId: 0 } },
      )
      .sort({ at: -1, seq: -1 })
      .limit(limit)
      .toArray();
    return docs.map(toEvent);
  }

  async lastSeq(): Promise<number> {
    const [last] = await this.collection
      .find({ feederId: this.feederId })
      .sort({ seq: -1 })
      .limit(1)
      .toArray();
    return last?.seq ?? 0;
  }
}

function toEvent(doc: Partial<EventDoc>): DeviceEvent {
  const event: DeviceEvent = {
    seq: doc.seq ?? 0,
    type: doc.type ?? "reiniciou",
    at: doc.at ?? new Date(0),
  };
  if (doc.portions !== undefined) event.portions = doc.portions;
  if (doc.grams !== undefined) event.grams = doc.grams;
  if (doc.origin !== undefined) event.origin = doc.origin;
  if (doc.reason !== undefined) event.reason = doc.reason;
  return event;
}

type StatusDoc = {
  _id: string;
  online: boolean;
  onlineChangedAt: Date | null;
  state: DeviceState | null;
};

export class MongoDeviceStatusRepository implements DeviceStatusRepository {
  private readonly collection: Collection<StatusDoc>;

  constructor(
    db: Db,
    private readonly feederId: string,
  ) {
    this.collection = db.collection<StatusDoc>("device_status");
  }

  async load(): Promise<DeviceStatus> {
    const doc = await this.collection.findOne({ _id: this.feederId });
    return {
      online: doc?.online ?? false,
      onlineChangedAt: doc?.onlineChangedAt ?? null,
      state: doc?.state ?? null,
    };
  }

  async save(status: DeviceStatus): Promise<void> {
    await this.collection.replaceOne(
      { _id: this.feederId },
      { ...status },
      { upsert: true },
    );
  }
}

// Só os alertas abertos ficam guardados; fechar é apagar. O `_id` com o tipo garante um aberto por tipo (R14).
type AlertDoc = Alert & { _id: string; feederId: string };

export class MongoAlertRepository implements AlertRepository {
  private readonly collection: Collection<AlertDoc>;

  constructor(
    db: Db,
    private readonly feederId: string,
  ) {
    this.collection = db.collection<AlertDoc>("alerts");
  }

  async listOpen(): Promise<Alert[]> {
    const docs = await this.collection
      .find({ feederId: this.feederId })
      .sort({ openedAt: 1 })
      .toArray();
    return docs.map((d) => ({
      type: d.type,
      message: d.message,
      openedAt: d.openedAt,
      notifiedAt: d.notifiedAt,
    }));
  }

  async open(alert: Alert): Promise<boolean> {
    try {
      await this.collection.insertOne({
        ...alert,
        _id: this.id(alert.type),
        feederId: this.feederId,
      });
      return true;
    } catch (err) {
      if (isDuplicateKey(err)) return false;
      throw err;
    }
  }

  async markNotified(type: AlertType, at: Date): Promise<void> {
    await this.collection.updateOne(
      { _id: this.id(type) },
      { $set: { notifiedAt: at } },
    );
  }

  async close(type: AlertType): Promise<void> {
    await this.collection.deleteOne({ _id: this.id(type) });
  }

  private id(type: AlertType): string {
    return `${this.feederId}:${type}`;
  }
}

type PushDoc = { _id: string; userId: string; keys: PushSubscription["keys"] };

export class MongoPushSubscriptionRepository
  implements PushSubscriptionRepository
{
  private readonly collection: Collection<PushDoc>;

  constructor(db: Db) {
    this.collection = db.collection<PushDoc>("push_subscriptions");
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ userId: 1 });
  }

  // O mesmo celular inscrito por outra conta passa a ser dessa conta.
  async add(userId: string, subscription: PushSubscription): Promise<void> {
    await this.collection.replaceOne(
      { _id: subscription.endpoint },
      { userId, keys: subscription.keys },
      { upsert: true },
    );
  }

  async listByUser(userId: string): Promise<PushSubscription[]> {
    const docs = await this.collection.find({ userId }).toArray();
    return docs.map((d) => ({ endpoint: d._id, keys: d.keys }));
  }

  async remove(endpoint: string): Promise<void> {
    await this.collection.deleteOne({ _id: endpoint });
  }
}

type UserDoc = Omit<UserProps, "id"> & { _id: string };

export class MongoUserRepository implements UserRepository {
  private readonly collection: Collection<UserDoc>;

  constructor(db: Db) {
    this.collection = db.collection<UserDoc>("users");
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ googleSub: 1 }, { unique: true });
  }

  async findById(id: string): Promise<User | null> {
    return toUser(await this.collection.findOne({ _id: id }));
  }

  async findByGoogleSub(sub: string): Promise<User | null> {
    return toUser(await this.collection.findOne({ googleSub: sub }));
  }

  async save(user: User): Promise<void> {
    const { id, ...rest } = user.toProps();
    await this.collection.replaceOne({ _id: id }, rest, { upsert: true });
  }
}

function toUser(doc: UserDoc | null): User | null {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return User.restore({ id: _id, ...rest });
}

type SessionDoc = Omit<Session, "tokenHash"> & { _id: string };

export class MongoSessionRepository implements SessionRepository {
  private readonly collection: Collection<SessionDoc>;

  constructor(db: Db) {
    this.collection = db.collection<SessionDoc>("sessions");
  }

  async ensureIndexes(): Promise<void> {
    // Índice TTL: o próprio Mongo apaga as sessões vencidas (confere mais ou menos a cada minuto).
    await this.collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    );
    await this.collection.createIndex({ userId: 1 });
  }

  async add(session: Session): Promise<void> {
    const { tokenHash, ...rest } = session;
    await this.collection.insertOne({ _id: tokenHash, ...rest });
  }

  async find(tokenHash: string): Promise<Session | null> {
    const doc = await this.collection.findOne({ _id: tokenHash });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return { tokenHash: _id, ...rest };
  }

  async update(session: Session): Promise<void> {
    const { tokenHash, ...rest } = session;
    await this.collection.replaceOne({ _id: tokenHash }, rest);
  }

  async remove(tokenHash: string): Promise<void> {
    await this.collection.deleteOne({ _id: tokenHash });
  }
}

// Os repositórios de cada comedouro são os de sempre, presos ao id dele.
export class MongoFeederStorage implements FeederStorage {
  constructor(private readonly db: Db) {}

  async ensureIndexes(): Promise<void> {
    await new MongoDeviceEventRepository(this.db, "").ensureIndexes();
    await this.db.collection("alerts").createIndex({ feederId: 1 });
  }

  forFeeder(feederId: string): FeederRepositories {
    return {
      feeder: new MongoFeederRepository(this.db, feederId),
      events: new MongoDeviceEventRepository(this.db, feederId),
      status: new MongoDeviceStatusRepository(this.db, feederId),
      alerts: new MongoAlertRepository(this.db, feederId),
    };
  }

  async purge(feederId: string): Promise<void> {
    await this.db
      .collection<{ _id: string }>("feeders")
      .deleteOne({ _id: feederId });
    await this.db.collection("device_events").deleteMany({ feederId });
    await this.db
      .collection<{ _id: string }>("device_status")
      .deleteOne({ _id: feederId });
    await this.db.collection("alerts").deleteMany({ feederId });
  }
}

type ProfileDoc = Omit<FeederProfileProps, "id"> & { _id: string };

export class MongoFeederProfileRepository implements FeederProfileRepository {
  private readonly collection: Collection<ProfileDoc>;

  constructor(db: Db) {
    this.collection = db.collection<ProfileDoc>("feeder_profiles");
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ ownerId: 1 });
  }

  async findById(id: string): Promise<FeederProfile | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toProfile(doc) : null;
  }

  async listByOwner(ownerId: string): Promise<FeederProfile[]> {
    return (await this.collection.find({ ownerId }).toArray()).map(toProfile);
  }

  async listAll(): Promise<FeederProfile[]> {
    return (await this.collection.find().toArray()).map(toProfile);
  }

  async save(profile: FeederProfile): Promise<void> {
    const { id, ...rest } = profile.toProps();
    await this.collection.replaceOne({ _id: id }, rest, { upsert: true });
  }

  async remove(id: string): Promise<void> {
    await this.collection.deleteOne({ _id: id });
  }
}

function toProfile(doc: ProfileDoc): FeederProfile {
  const { _id, ...rest } = doc;
  // Perfis criados antes da P4 não têm o campo.
  return FeederProfile.restore({
    id: _id,
    ...rest,
    pairedAt: rest.pairedAt ?? null,
  });
}

type CredentialDoc = Omit<DeviceCredential, "username"> & { _id: string };

export class MongoDeviceCredentialRepository
  implements DeviceCredentialRepository
{
  private readonly collection: Collection<CredentialDoc>;

  constructor(db: Db) {
    this.collection = db.collection<CredentialDoc>("device_credentials");
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ feederId: 1 });
  }

  async findByUsername(username: string): Promise<DeviceCredential | null> {
    const doc = await this.collection.findOne({ _id: username });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return { username: _id, ...rest };
  }

  async save(credential: DeviceCredential): Promise<void> {
    const { username, ...rest } = credential;
    await this.collection.replaceOne({ _id: username }, rest, { upsert: true });
  }

  async removeByFeeder(feederId: string): Promise<void> {
    await this.collection.deleteMany({ feederId });
  }
}

type PetDoc = Omit<PetProps, "id"> & { _id: string };

export class MongoPetRepository implements PetRepository {
  private readonly collection: Collection<PetDoc>;

  constructor(db: Db) {
    this.collection = db.collection<PetDoc>("pets");
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ ownerId: 1 });
  }

  async findById(id: string): Promise<Pet | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? toPet(doc) : null;
  }

  async listByOwner(ownerId: string): Promise<Pet[]> {
    return (await this.collection.find({ ownerId }).toArray()).map(toPet);
  }

  async save(pet: Pet): Promise<void> {
    const { id, ...rest } = pet.toProps();
    await this.collection.replaceOne({ _id: id }, rest, { upsert: true });
  }

  async remove(id: string): Promise<void> {
    await this.collection.deleteOne({ _id: id });
  }
}

function toPet(doc: PetDoc): Pet {
  const { _id, ...rest } = doc;
  return Pet.restore({ id: _id, ...rest });
}

type PhotoDoc = { _id: string; contentType: PhotoType; data: Binary };

export class MongoPetPhotoRepository implements PetPhotoRepository {
  private readonly collection: Collection<PhotoDoc>;

  constructor(db: Db) {
    this.collection = db.collection<PhotoDoc>("pet_photos");
  }

  async get(petId: string): Promise<PetPhoto | null> {
    const doc = await this.collection.findOne({ _id: petId });
    if (!doc) return null;
    return { contentType: doc.contentType, data: Buffer.from(doc.data.buffer) };
  }

  async save(petId: string, photo: PetPhoto): Promise<void> {
    await this.collection.replaceOne(
      { _id: petId },
      { contentType: photo.contentType, data: new Binary(photo.data) },
      { upsert: true },
    );
  }

  async remove(petId: string): Promise<void> {
    await this.collection.deleteOne({ _id: petId });
  }
}

// Um código por comedouro: o _id é o id do comedouro, e um código novo substitui o anterior.
type CodeDoc = Omit<PairingCodeProps, "feederId"> & { _id: string };

export class MongoPairingCodeRepository implements PairingCodeRepository {
  private readonly collection: Collection<CodeDoc>;

  constructor(db: Db) {
    this.collection = db.collection<CodeDoc>("pairing_codes");
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ code: 1, expiresAt: -1 });
    // Uma hora depois de vencer, o próprio Mongo apaga.
    await this.collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 3600 },
    );
  }

  async findByCode(code: string): Promise<PairingCode | null> {
    const [doc] = await this.collection
      .find({ code })
      .sort({ expiresAt: -1 })
      .limit(1)
      .toArray();
    return doc ? toCode(doc) : null;
  }

  async findByFeeder(feederId: string): Promise<PairingCode | null> {
    const doc = await this.collection.findOne({ _id: feederId });
    return doc ? toCode(doc) : null;
  }

  async save(code: PairingCode): Promise<void> {
    const { feederId, ...rest } = code.toProps();
    await this.collection.replaceOne({ _id: feederId }, rest, { upsert: true });
  }

  async removeByFeeder(feederId: string): Promise<void> {
    await this.collection.deleteOne({ _id: feederId });
  }
}

function toCode(doc: CodeDoc): PairingCode {
  const { _id, ...rest } = doc;
  return PairingCode.restore({ feederId: _id, ...rest });
}
