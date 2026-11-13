import { type Collection, type Db, MongoServerError } from "mongodb";
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
  DeviceEventRepository,
  DeviceStatusRepository,
  FeederRepository,
  PushSubscription,
  PushSubscriptionRepository,
} from "../../application/ports.js";
import type {
  DeviceEvent,
  DeviceState,
  DeviceStatus,
} from "../../domain/device/device.js";
import { Feeder } from "../../domain/feeder/feeder.js";
import { ErroDeDominio } from "../../domain/shared/erro-de-dominio.js";

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

type PushDoc = { _id: string; keys: PushSubscription["keys"] };

export class MongoPushSubscriptionRepository
  implements PushSubscriptionRepository
{
  private readonly collection: Collection<PushDoc>;

  constructor(db: Db) {
    this.collection = db.collection<PushDoc>("push_subscriptions");
  }

  async add(subscription: PushSubscription): Promise<void> {
    await this.collection.replaceOne(
      { _id: subscription.endpoint },
      { keys: subscription.keys },
      { upsert: true },
    );
  }

  async list(): Promise<PushSubscription[]> {
    const docs = await this.collection.find().toArray();
    return docs.map((d) => ({ endpoint: d._id, keys: d.keys }));
  }

  async remove(endpoint: string): Promise<void> {
    await this.collection.deleteOne({ _id: endpoint });
  }
}
