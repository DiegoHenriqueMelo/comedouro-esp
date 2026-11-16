import { randomInt, randomUUID } from "node:crypto";
import {
  type FeederKind,
  FeederProfile,
} from "../domain/feeder/feeder-profile.js";
import { PairingCode } from "../domain/feeder/pairing-code.js";
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
  PairingCodeRepository,
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
  codes: PairingCodeRepository;
  notifier: UserNotifier;
  clock: Clock;
  log?: Log;
};

// O que o aparelho recebe ao parear: o usuário e a senha MQTT. Aparecem uma vez só.
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
  ): Promise<{ runtime: FeederRuntime; code: PairingCode | null }> {
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

    await this.deps.profiles.save(profile);
    const runtime = await this.start(profile);
    // Um aparelho nasce esperando o pareamento: o app já mostra o código.
    const code = kind === "aparelho" ? await this.newCode(profile.id) : null;
    return { runtime, code };
  }

  // Um código novo para parear (ou parear de novo) o aparelho. O anterior deixa de valer.
  async issuePairingCode(
    ownerId: string,
    feederId: string,
  ): Promise<PairingCode> {
    const runtime = await this.get(ownerId, feederId);
    if (runtime.profile.kind !== "aparelho") {
      throw new ErroDeDominio(
        "nao_e_aparelho",
        "só um comedouro de aparelho tem código de pareamento",
      );
    }
    return this.newCode(feederId);
  }

  // O código que ainda vale, se houver: abrir a tela de novo não precisa gerar outro.
  async currentPairingCode(
    ownerId: string,
    feederId: string,
  ): Promise<PairingCode | null> {
    await this.get(ownerId, feederId);
    const code = await this.deps.codes.findByFeeder(feederId);
    return code?.isActiveAt(this.deps.clock.now()) ? code : null;
  }

  // O aparelho troca o código pela senha MQTT. Parear de novo troca a senha e derruba o aparelho antigo;
  // a agenda, os ajustes e o histórico continuam.
  async pair(codeText: string): Promise<NewDeviceCredential> {
    const now = this.deps.clock.now();
    const code = await this.deps.codes.findByCode(codeText);
    if (!code) {
      throw new ErroDeDominio("codigo_invalido", "código inválido ou vencido");
    }
    code.use(now);
    await this.deps.codes.save(code);

    const profile = await this.deps.profiles.findById(code.feederId);
    if (!profile) {
      throw new ErroDeDominio("codigo_invalido", "código inválido ou vencido");
    }

    const senha = newDevicePassword();
    await this.deps.credentials.removeByFeeder(profile.id);
    await this.deps.credentials.save({
      feederId: profile.id,
      username: profile.id,
      passwordHash: await hashPassword(senha),
    });

    profile.paired(now);
    await this.deps.profiles.save(profile);
    const runtime = this.runtimes.get(profile.id);
    if (runtime) {
      runtime.profile = profile;
      runtime.handle.kick();
    }
    return { usuario: profile.id, senha };
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
    await this.deps.codes.removeByFeeder(feederId);
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

  // Seis dígitos ao acaso, sem repetir um código que ainda vale em outro comedouro.
  private async newCode(feederId: string): Promise<PairingCode> {
    const now = this.deps.clock.now();
    for (let attempt = 0; attempt < 20; attempt++) {
      const text = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const taken = await this.deps.codes.findByCode(text);
      if (taken?.isActiveAt(now)) continue;
      const code = PairingCode.issue(feederId, text, now);
      await this.deps.codes.save(code);
      return code;
    }
    throw new Error("não achei um código de pareamento livre");
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
