import { MongoClient } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fromScheduleDto } from "../application/dto.js";
import type {
  AlertRepository,
  DeviceCredentialRepository,
  DeviceEventRepository,
  DeviceStatusRepository,
  FeederProfileRepository,
  FeederRepository,
  FeederStorage,
  PairingCodeRepository,
  PetPhotoRepository,
  PetRepository,
  PushSubscriptionRepository,
  SessionRepository,
  UserRepository,
} from "../application/ports.js";
import type { DeviceEvent } from "../domain/device/device.js";
import { Feeder } from "../domain/feeder/feeder.js";
import { FeederProfile } from "../domain/feeder/feeder-profile.js";
import { PairingCode } from "../domain/feeder/pairing-code.js";
import { Pet } from "../domain/pet/pet.js";
import { User } from "../domain/user/user.js";
import {
  MemoryAlertRepository,
  MemoryDeviceCredentialRepository,
  MemoryDeviceEventRepository,
  MemoryDeviceStatusRepository,
  MemoryFeederProfileRepository,
  MemoryFeederRepository,
  MemoryFeederStorage,
  MemoryPairingCodeRepository,
  MemoryPetPhotoRepository,
  MemoryPetRepository,
  MemoryPushSubscriptionRepository,
  MemorySessionRepository,
  MemoryUserRepository,
} from "./memory/memory-repositories.js";
import {
  MongoAlertRepository,
  MongoDeviceCredentialRepository,
  MongoDeviceEventRepository,
  MongoDeviceStatusRepository,
  MongoFeederProfileRepository,
  MongoFeederRepository,
  MongoFeederStorage,
  MongoPairingCodeRepository,
  MongoPetPhotoRepository,
  MongoPetRepository,
  MongoPushSubscriptionRepository,
  MongoSessionRepository,
  MongoUserRepository,
} from "./mongo/mongo-repositories.js";

// A suíte de contrato: os mesmos testes rodam contra os repositórios em memória e contra os do MongoDB.
// Se os dois passam, dá para trocar um pelo outro sem mudar mais nada.

type Repositories = {
  feeders: FeederRepository;
  events: DeviceEventRepository;
  status: DeviceStatusRepository;
  alerts: AlertRepository;
  subscriptions: PushSubscriptionRepository;
  users: UserRepository;
  sessions: SessionRepository;
  profiles: FeederProfileRepository;
  credentials: DeviceCredentialRepository;
  storage: FeederStorage;
  pets: PetRepository;
  photos: PetPhotoRepository;
  codes: PairingCodeRepository;
};

const cafe = fromScheduleDto([{ hora: "07:30", porcoes: 2, ativo: true }]);
const at = (minute: number) => new Date(Date.UTC(2026, 10, 10, 12, minute));

function contract(name: string, create: () => Promise<Repositories>) {
  describe(`contrato dos repositórios: ${name}`, () => {
    let r: Repositories;

    beforeEach(async () => {
      r = await create();
    });

    describe("alimentador", () => {
      it("carregar o que não existe devolve null", async () => {
        expect(await r.feeders.load()).toBeNull();
      });

      it("salvar e carregar devolve um alimentador igual", async () => {
        const feeder = Feeder.create();
        await r.feeders.save(feeder, null);

        feeder.replaceSchedule(cafe);
        await r.feeders.save(feeder, 1);

        const loaded = await r.feeders.load();
        expect(loaded?.version).toBe(2);
        expect(loaded?.schedule).toEqual(feeder.schedule);
        expect(loaded?.configuration).toEqual(feeder.configuration);
      });

      it("mexer no objeto depois de salvar não muda o que está salvo", async () => {
        const feeder = Feeder.create();
        await r.feeders.save(feeder, null);

        feeder.replaceSchedule(cafe); // não salvou

        expect((await r.feeders.load())?.schedule).toEqual([]);
      });

      it("dois 'carrega, altera, salva' ao mesmo tempo: o segundo falha com conflito_de_versao", async () => {
        await r.feeders.save(Feeder.create(), null);
        const a = await r.feeders.load();
        const b = await r.feeders.load();
        if (!a || !b) throw new Error("deveria ter carregado");

        a.replaceSchedule(cafe);
        await r.feeders.save(a, 1);

        b.replaceSchedule([]);
        await expect(r.feeders.save(b, 1)).rejects.toMatchObject({
          codigo: "conflito_de_versao",
        });
        expect((await r.feeders.load())?.schedule).toEqual(a.schedule);
      });

      it("criar duas vezes falha com conflito_de_versao", async () => {
        await r.feeders.save(Feeder.create(), null);

        await expect(
          r.feeders.save(Feeder.create(), null),
        ).rejects.toMatchObject({ codigo: "conflito_de_versao" });
      });
    });

    describe("eventos do dispositivo", () => {
      const served = (seq: number, minute: number): DeviceEvent => ({
        seq,
        type: "refeicao_servida",
        at: at(minute),
        portions: 2,
        grams: 12,
        origin: "agenda",
      });

      it("sem eventos, o último seq é 0", async () => {
        expect(await r.events.lastSeq()).toBe(0);
        expect(await r.events.list(10)).toEqual([]);
      });

      it("o mesmo seq duas vezes grava uma vez", async () => {
        expect(await r.events.add(served(1, 0))).toBe(true);
        expect(await r.events.add(served(1, 0))).toBe(false);

        expect(await r.events.list(10)).toHaveLength(1);
      });

      it("lista do mais recente para o mais antigo, pela hora, e respeita o limite", async () => {
        await r.events.add(served(1, 10));
        await r.events.add(served(3, 30));
        await r.events.add(served(2, 20));

        const list = await r.events.list(2);

        expect(list.map((e) => e.seq)).toEqual([3, 2]);
        expect(list[0]).toEqual(served(3, 30));
        expect(await r.events.lastSeq()).toBe(3);
      });

      it("guarda o evento sem os campos opcionais", async () => {
        const event: DeviceEvent = { seq: 9, type: "reiniciou", at: at(5) };
        await r.events.add(event);

        expect(await r.events.list(1)).toEqual([event]);
      });
    });

    describe("estado do dispositivo", () => {
      it("sem nada salvo, está offline e sem estado", async () => {
        expect(await r.status.load()).toEqual({
          online: false,
          onlineChangedAt: null,
          state: null,
        });
      });

      it("salvar substitui o estado anterior inteiro", async () => {
        const state = {
          at: at(0),
          timeValid: true,
          state: "ocioso" as const,
          bowl: { grams: 3.5, stable: true },
          bottle: { percent: 80, daysLeft: 12 },
          sensors: { scale: true, level: true },
          configVersion: 4,
        };
        await r.status.save({ online: true, onlineChangedAt: at(0), state });
        await r.status.save({
          online: false,
          onlineChangedAt: at(9),
          state: { ...state, bowl: { grams: null, stable: false } },
        });

        const loaded = await r.status.load();
        expect(loaded.online).toBe(false);
        expect(loaded.onlineChangedAt).toEqual(at(9));
        expect(loaded.state?.bowl).toEqual({ grams: null, stable: false });
      });
    });

    describe("alertas", () => {
      const alert = {
        type: "garrafa_baixa" as const,
        message: "A garrafa está com 11%.",
        openedAt: at(0),
        notifiedAt: null,
      };

      it("R14: só um alerta aberto de cada tipo", async () => {
        expect(await r.alerts.open(alert)).toBe(true);
        expect(await r.alerts.open({ ...alert, message: "outra" })).toBe(false);

        expect(await r.alerts.listOpen()).toEqual([alert]);
      });

      it("marca como avisado, e fechar libera abrir de novo", async () => {
        await r.alerts.open(alert);
        await r.alerts.markNotified("garrafa_baixa", at(1));
        expect((await r.alerts.listOpen())[0]?.notifiedAt).toEqual(at(1));

        await r.alerts.close("garrafa_baixa");
        expect(await r.alerts.listOpen()).toEqual([]);
        expect(await r.alerts.open(alert)).toBe(true);
      });
    });

    describe("inscrições de push", () => {
      const sub = {
        endpoint: "https://push.example.com/abc",
        keys: { p256dh: "chave", auth: "segredo" },
      };

      it("a mesma inscrição duas vezes fica uma só, e remover apaga", async () => {
        await r.subscriptions.add("u1", sub);
        await r.subscriptions.add("u1", sub);
        expect(await r.subscriptions.listByUser("u1")).toEqual([sub]);

        await r.subscriptions.remove(sub.endpoint);
        expect(await r.subscriptions.listByUser("u1")).toEqual([]);
      });

      it("cada pessoa só recebe nos aparelhos dela", async () => {
        const outro = { ...sub, endpoint: "https://push.example.com/xyz" };
        await r.subscriptions.add("u1", sub);
        await r.subscriptions.add("u2", outro);

        expect(await r.subscriptions.listByUser("u1")).toEqual([sub]);
        expect(await r.subscriptions.listByUser("u2")).toEqual([outro]);
      });

      it("o celular inscrito por outra conta passa a ser dela", async () => {
        await r.subscriptions.add("u1", sub);
        await r.subscriptions.add("u2", sub);

        expect(await r.subscriptions.listByUser("u1")).toEqual([]);
        expect(await r.subscriptions.listByUser("u2")).toEqual([sub]);
      });
    });

    describe("perfis de comedouro", () => {
      const perfil = (id: string, ownerId: string) =>
        FeederProfile.create({
          id,
          ownerId,
          nickname: `Comedouro ${id}`,
          kind: "simulado",
          createdAt: at(0),
        });

      it("lista por dono, acha por id, substitui e remove", async () => {
        await r.profiles.save(perfil("f1", "u1"));
        await r.profiles.save(perfil("f2", "u1"));
        await r.profiles.save(perfil("f3", "u2"));

        const meus = await r.profiles.listByOwner("u1");
        expect(meus.map((p) => p.id).sort()).toEqual(["f1", "f2"]);
        expect((await r.profiles.listAll()).length).toBe(3);

        const f1 = perfil("f1", "u1");
        f1.rename("Sala");
        await r.profiles.save(f1);
        expect((await r.profiles.findById("f1"))?.toProps()).toEqual(
          f1.toProps(),
        );

        await r.profiles.remove("f1");
        expect(await r.profiles.findById("f1")).toBeNull();
      });
    });

    describe("credenciais dos aparelhos", () => {
      it("acha pelo usuário e apaga pelo comedouro", async () => {
        const credencial = {
          feederId: "f1",
          username: "f1",
          passwordHash: "scrypt:aa:bb",
        };
        await r.credentials.save(credencial);
        expect(await r.credentials.findByUsername("f1")).toEqual(credencial);

        await r.credentials.removeByFeeder("f1");
        expect(await r.credentials.findByUsername("f1")).toBeNull();
      });
    });

    describe("códigos de pareamento", () => {
      it("um por comedouro: o novo substitui o anterior", async () => {
        await r.codes.save(PairingCode.issue("f1", "111111", at(0)));
        await r.codes.save(PairingCode.issue("f1", "222222", at(1)));

        expect((await r.codes.findByFeeder("f1"))?.code).toBe("222222");
        expect(await r.codes.findByCode("111111")).toBeNull();
        expect((await r.codes.findByCode("222222"))?.feederId).toBe("f1");
      });

      it("guarda o uso, e o mesmo número em outro comedouro devolve o mais recente", async () => {
        const old = PairingCode.issue("f1", "333333", at(0));
        old.use(at(1));
        await r.codes.save(old);
        await r.codes.save(PairingCode.issue("f2", "333333", at(30)));

        const found = await r.codes.findByCode("333333");
        expect(found?.feederId).toBe("f2");
        expect(found?.isActiveAt(at(31))).toBe(true);
        expect((await r.codes.findByFeeder("f1"))?.isActiveAt(at(2))).toBe(
          false,
        );
      });

      it("apaga pelo comedouro", async () => {
        await r.codes.save(PairingCode.issue("f1", "444444", at(0)));
        await r.codes.removeByFeeder("f1");

        expect(await r.codes.findByFeeder("f1")).toBeNull();
        expect(await r.codes.findByCode("444444")).toBeNull();
      });
    });

    describe("pets", () => {
      const pet = (id: string, ownerId: string) =>
        Pet.create(
          { id, ownerId, createdAt: at(0) },
          {
            name: `Pet ${id}`,
            species: "gato",
            birthDate: "2023-05-10",
            weightKg: 4.2,
          },
          "2026-11-16",
        );

      it("lista por dono, acha por id, substitui e remove", async () => {
        await r.pets.save(pet("p1", "u1"));
        await r.pets.save(pet("p2", "u1"));
        await r.pets.save(pet("p3", "u2"));

        const meus = await r.pets.listByOwner("u1");
        expect(meus.map((p) => p.id).sort()).toEqual(["p1", "p2"]);

        const p1 = pet("p1", "u1");
        p1.photoChanged(7);
        await r.pets.save(p1);
        expect((await r.pets.findById("p1"))?.toProps()).toEqual(p1.toProps());

        await r.pets.remove("p1");
        expect(await r.pets.findById("p1")).toBeNull();
      });

      it("guarda a foto com o tipo e os bytes iguais", async () => {
        const photo = {
          contentType: "image/jpeg" as const,
          data: Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]),
        };
        await r.photos.save("p1", photo);

        expect(await r.photos.get("p1")).toEqual(photo);
        expect(await r.photos.get("p2")).toBeNull();

        await r.photos.remove("p1");
        expect(await r.photos.get("p1")).toBeNull();
      });
    });

    describe("dados por comedouro", () => {
      it("cada comedouro tem os seus, e apagar um não mexe no outro", async () => {
        const a = r.storage.forFeeder("a");
        const b = r.storage.forFeeder("b");
        await a.feeder.save(Feeder.create(), null);
        await b.feeder.save(Feeder.create(), null);
        await a.events.add({ seq: 1, type: "reiniciou", at: at(0) });
        await b.events.add({ seq: 1, type: "reiniciou", at: at(0) });

        await r.storage.purge("a");

        const a2 = r.storage.forFeeder("a");
        expect(await a2.feeder.load()).toBeNull();
        expect(await a2.events.lastSeq()).toBe(0);
        expect(await r.storage.forFeeder("b").feeder.load()).not.toBeNull();
        expect(await r.storage.forFeeder("b").events.lastSeq()).toBe(1);
      });
    });

    describe("usuários", () => {
      const ana = {
        sub: "google-ana",
        email: "ana@example.com",
        name: "Ana",
        picture: null,
      };

      it("acha pelo id e pelo sub do Google; o que não existe devolve null", async () => {
        const user = User.create("u1", ana, at(0));
        await r.users.save(user);

        expect((await r.users.findById("u1"))?.toProps()).toEqual(
          user.toProps(),
        );
        expect((await r.users.findByGoogleSub("google-ana"))?.id).toBe("u1");
        expect(await r.users.findById("u2")).toBeNull();
        expect(await r.users.findByGoogleSub("google-bia")).toBeNull();
      });

      it("salvar de novo substitui", async () => {
        const user = User.create("u1", ana, at(0));
        await r.users.save(user);
        user.updateFrom({ ...ana, name: "Ana Souza" });
        await r.users.save(user);

        expect((await r.users.findById("u1"))?.name).toBe("Ana Souza");
      });
    });

    describe("sessões", () => {
      const session = {
        tokenHash: "hash-1",
        userId: "u1",
        expiresAt: at(30),
        renewedAt: at(0),
      };

      it("guarda, acha, atualiza e remove", async () => {
        await r.sessions.add(session);
        expect(await r.sessions.find("hash-1")).toEqual(session);
        expect(await r.sessions.find("hash-2")).toBeNull();

        const renewed = { ...session, expiresAt: at(59), renewedAt: at(29) };
        await r.sessions.update(renewed);
        expect(await r.sessions.find("hash-1")).toEqual(renewed);

        await r.sessions.remove("hash-1");
        expect(await r.sessions.find("hash-1")).toBeNull();
      });
    });
  });
}

contract("memória", async () => ({
  feeders: new MemoryFeederRepository(),
  events: new MemoryDeviceEventRepository(),
  status: new MemoryDeviceStatusRepository(),
  alerts: new MemoryAlertRepository(),
  subscriptions: new MemoryPushSubscriptionRepository(),
  users: new MemoryUserRepository(),
  sessions: new MemorySessionRepository(),
  profiles: new MemoryFeederProfileRepository(),
  credentials: new MemoryDeviceCredentialRepository(),
  storage: new MemoryFeederStorage(),
  pets: new MemoryPetRepository(),
  photos: new MemoryPetPhotoRepository(),
  codes: new MemoryPairingCodeRepository(),
}));

// Os testes do MongoDB precisam de um banco no ar: `docker compose up -d mongo` na raiz do repo.
// Sem banco, eles são pulados (aparecem como "skipped"), e o resto da suíte roda normalmente.
const MONGO_TEST_URL =
  process.env.MONGO_TEST_URL ?? "mongodb://127.0.0.1:27017";

async function mongoIsUp(): Promise<boolean> {
  const probe = new MongoClient(MONGO_TEST_URL, {
    serverSelectionTimeoutMS: 1500,
  });
  try {
    await probe.connect();
    return true;
  } catch {
    return false;
  } finally {
    await probe.close().catch(() => {});
  }
}

describe.skipIf(!(await mongoIsUp()))("MongoDB", () => {
  let client: MongoClient;
  const prefix = `contrato_${Date.now()}`;
  let count = 0;

  beforeAll(async () => {
    client = new MongoClient(MONGO_TEST_URL);
    await client.connect();
  });

  afterAll(async () => {
    for (let i = 1; i <= count; i++) {
      await client.db(`${prefix}_${i}`).dropDatabase();
    }
    await client.close();
  });

  contract("MongoDB", async () => {
    // Um banco novo para cada teste: nenhum depende do que o outro deixou.
    count += 1;
    const db = client.db(`${prefix}_${count}`);
    const events = new MongoDeviceEventRepository(db, "teste");
    await events.ensureIndexes();
    const users = new MongoUserRepository(db);
    await users.ensureIndexes();
    const sessions = new MongoSessionRepository(db);
    await sessions.ensureIndexes();
    const storage = new MongoFeederStorage(db);
    await storage.ensureIndexes();

    return {
      feeders: new MongoFeederRepository(db, "teste"),
      events,
      status: new MongoDeviceStatusRepository(db, "teste"),
      alerts: new MongoAlertRepository(db, "teste"),
      subscriptions: new MongoPushSubscriptionRepository(db),
      users,
      sessions,
      profiles: new MongoFeederProfileRepository(db),
      credentials: new MongoDeviceCredentialRepository(db),
      storage,
      pets: new MongoPetRepository(db),
      photos: new MongoPetPhotoRepository(db),
      codes: new MongoPairingCodeRepository(db),
    };
  });
});
