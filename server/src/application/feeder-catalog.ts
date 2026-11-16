import { randomUUID } from "node:crypto";
import {
  type FeederKind,
  FeederProfile,
} from "../domain/feeder/feeder-profile.js";
import {
  ErroDeDominio,
  NaoEncontrado,
} from "../domain/shared/erro-de-dominio.js";
import { hashPassword, newDevicePassword } from "./credentials.js";
import { FeederRuntime } from "./feeder-runtime.js";
import type {
  Clock,
  DeviceCredentialRepository,
  DeviceFactory,
  FeederProfileRepository,
  FeederStorage,
  UserNotifier,
} from "./ports.js";

type Log = {
  warn(obj: unknown, msg: string): void;
  error(obj: unknown, msg: string): void;
};

// D18: limites por conta, num serviço aberto.
export const MAX_FEEDERS = 10;
export const MAX_SIMULATED = 1;

export type CatalogDeps = {
  profiles: FeederProfileRepository;
  storage: FeederStorage;
  devices: DeviceFactory;
  credentials: DeviceCredentialRepository;
  notifier: UserNotifier;
  clock: Clock;
  log?: Log;
};

// O usuário e a senha MQTT de um aparelho novo. Aparecem uma vez só, na criação.
export type NewDeviceCredential = { usuario: string; senha: string };

const silent: Log = { warn: () => {}, error: () => {} };

// Os comedouros de todas as contas. Toda busca passa pelo dono: comedouro de outra conta é "não encontrado".
export class FeederCatalog {
  private readonly runtimes = new Map<string, FeederRuntime>();
  private readonly log: Log;

  constructor(private readonly deps: CatalogDeps) {
    this.log = deps.log ?? silent;
  }

  get supportsHardware(): boolean {
    return this.deps.devices.supportsHardware;
  }

  // Ao subir o servidor: liga todos os comedouros salvos.
  async startAll(): Promise<void> {
    for (const profile of await this.deps.profiles.listAll()) {
      try {
        await this.start(profile);
      } catch (err) {
        this.log.error({ err, feederId: profile.id }, "comedouro não ligou");
      }
    }
  }

  async list(ownerId: string): Promise<FeederRuntime[]> {
    const profiles = await this.deps.profiles.listByOwner(ownerId);
    const sorted = [...profiles].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    return Promise.all(sorted.map((p) => this.runtimeOf(p)));
  }

  async create(
    ownerId: string,
    nickname: string,
    kind: FeederKind,
  ): Promise<{
    runtime: FeederRuntime;
    credential: NewDeviceCredential | null;
  }> {
    if (kind === "aparelho" && !this.deps.devices.supportsHardware) {
      throw new ErroDeDominio(
        "aparelho_indisponivel",
        "este servidor não tem broker MQTT: só dá para criar comedouros simulados",
      );
    }
    const mine = await this.deps.profiles.listByOwner(ownerId);
    if (mine.length >= MAX_FEEDERS) {
      throw new ErroDeDominio(
        "limite_de_comedouros",
        `cada conta tem no máximo ${MAX_FEEDERS} comedouros`,
      );
    }
    if (
      kind === "simulado" &&
      mine.filter((p) => p.kind === "simulado").length >= MAX_SIMULATED
    ) {
      throw new ErroDeDominio(
        "limite_de_simulados",
        `cada conta tem no máximo ${MAX_SIMULATED} comedouro simulado`,
      );
    }

    const profile = FeederProfile.create({
      id: randomUUID(),
      ownerId,
      nickname,
      kind,
      createdAt: this.deps.clock.now(),
    });

    let credential: NewDeviceCredential | null = null;
    if (kind === "aparelho") {
      const senha = newDevicePassword();
      await this.deps.credentials.save({
        feederId: profile.id,
        username: profile.id,
        passwordHash: await hashPassword(senha),
      });
      credential = { usuario: profile.id, senha };
    }

    await this.deps.profiles.save(profile);
    return { runtime: await this.start(profile), credential };
  }

  async get(ownerId: string, feederId: string): Promise<FeederRuntime> {
    const running = this.runtimes.get(feederId);
    if (running) {
      if (!running.profile.isOwnedBy(ownerId)) throw new NaoEncontrado();
      return running;
    }
    const profile = await this.deps.profiles.findById(feederId);
    if (profile === null || !profile.isOwnedBy(ownerId)) {
      throw new NaoEncontrado();
    }
    return this.start(profile);
  }

  async rename(
    ownerId: string,
    feederId: string,
    nickname: string,
  ): Promise<FeederRuntime> {
    const runtime = await this.get(ownerId, feederId);
    const renamed = FeederProfile.restore(runtime.profile.toProps());
    renamed.rename(nickname);
    await this.deps.profiles.save(renamed);
    runtime.profile = renamed;
    return runtime;
  }

  // D15: apaga as credenciais, derruba o aparelho e apaga os dados do comedouro.
  async remove(ownerId: string, feederId: string): Promise<void> {
    const runtime = await this.get(ownerId, feederId);
    this.runtimes.delete(feederId);
    // Primeiro a credencial: o aparelho derrubado não consegue entrar de novo.
    await this.deps.credentials.removeByFeeder(feederId);
    // Ainda conectado, o servidor limpa as mensagens retidas; só depois desliga.
    await runtime.handle.forget();
    await runtime.stop();
    await this.deps.storage.purge(feederId);
    await this.deps.profiles.remove(feederId);
  }

  async checkOffline(): Promise<void> {
    for (const runtime of this.runtimes.values()) {
      try {
        await runtime.devices.checkOffline();
      } catch (err) {
        this.log.error({ err, feederId: runtime.id }, "erro ao conferir");
      }
    }
  }

  async close(): Promise<void> {
    for (const runtime of this.runtimes.values()) await runtime.stop();
    this.runtimes.clear();
  }

  private async runtimeOf(profile: FeederProfile): Promise<FeederRuntime> {
    return this.runtimes.get(profile.id) ?? this.start(profile);
  }

  private async start(profile: FeederProfile): Promise<FeederRuntime> {
    const runtime = new FeederRuntime(
      profile,
      this.deps.storage.forFeeder(profile.id),
      this.deps.devices.create(profile.id, profile.kind),
      this.deps.notifier,
      this.deps.clock,
      this.log,
    );
    this.runtimes.set(profile.id, runtime);
    await runtime.start();
    return runtime;
  }
}
