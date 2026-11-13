import { MongoClient } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fromScheduleDto } from "../application/dto.js";
import type {
  AlertRepository,
  DeviceEventRepository,
  DeviceStatusRepository,
  FeederRepository,
  PushSubscriptionRepository,
} from "../application/ports.js";
import type { DeviceEvent } from "../domain/device/device.js";
import { Feeder } from "../domain/feeder/feeder.js";
import {
  MemoryAlertRepository,
  MemoryDeviceEventRepository,
  MemoryDeviceStatusRepository,
  MemoryFeederRepository,
  MemoryPushSubscriptionRepository,
} from "./memory/memory-repositories.js";
import {
  MongoAlertRepository,
  MongoDeviceEventRepository,
  MongoDeviceStatusRepository,
  MongoFeederRepository,
  MongoPushSubscriptionRepository,
} from "./mongo/mongo-repositories.js";

// A suíte de contrato: os mesmos testes rodam contra os repositórios em memória e contra os do MongoDB.
// Se os dois passam, dá para trocar um pelo outro sem mudar mais nada.

type Repositories = {
  feeders: FeederRepository;
  events: DeviceEventRepository;
  status: DeviceStatusRepository;
  alerts: AlertRepository;
  subscriptions: PushSubscriptionRepository;
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
        await r.subscriptions.add(sub);
        await r.subscriptions.add(sub);
        expect(await r.subscriptions.list()).toEqual([sub]);

        await r.subscriptions.remove(sub.endpoint);
        expect(await r.subscriptions.list()).toEqual([]);
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

    return {
      feeders: new MongoFeederRepository(db, "teste"),
      events,
      status: new MongoDeviceStatusRepository(db, "teste"),
      alerts: new MongoAlertRepository(db, "teste"),
      subscriptions: new MongoPushSubscriptionRepository(db),
    };
  });
});
