import type {
  CommandResult,
  DeviceCommand,
  DeviceEvent,
  DeviceState,
  DeviceStatus,
} from "../domain/device/device.js";
import type { Feeder } from "../domain/feeder/feeder.js";
import type {
  FeederKind,
  FeederProfile,
} from "../domain/feeder/feeder-profile.js";
import type { Pet } from "../domain/pet/pet.js";
import type { PetPhoto } from "../domain/pet/pet-photo.js";
import type { Identity, User } from "../domain/user/user.js";
import type { ConfigPayload } from "./dto.js";

// As portas: interfaces que a aplicação define e a infraestrutura implementa.

export interface Clock {
  now(): Date;
}

export interface FeederRepository {
  load(): Promise<Feeder | null>;
  // `expectedVersion` é a versão que estava salva quando o alimentador foi carregado (null se é novo).
  // Se o banco tiver outra, lança ErroDeDominio("conflito_de_versao").
  save(feeder: Feeder, expectedVersion: number | null): Promise<void>;
}

export interface DeviceEventRepository {
  // Devolve false quando o `seq` já tinha sido registrado.
  add(event: DeviceEvent): Promise<boolean>;
  // Do mais recente para o mais antigo, pela hora do evento.
  list(limit: number): Promise<DeviceEvent[]>;
  lastSeq(): Promise<number>;
}

export interface DeviceStatusRepository {
  load(): Promise<DeviceStatus>;
  save(status: DeviceStatus): Promise<void>;
}

export type DeviceListeners = {
  event(event: DeviceEvent): Promise<void>;
  state(state: DeviceState): Promise<void>;
  online(online: boolean): Promise<void>;
};

// O ESP32, na língua do domínio. Adaptadores: simulado em memória e MQTT.
export interface Device {
  send(command: DeviceCommand): Promise<CommandResult>;
  publishConfiguration(payload: ConfigPayload): Promise<void>;
  // Diz ao dispositivo o último evento que o servidor já tem, para ele reenviar o resto.
  publishSync(lastSeq: number): Promise<void>;
  listen(listeners: DeviceListeners): void;
  close(): Promise<void>;
}

export const ALERT_TYPES = [
  "garrafa_baixa",
  "porcao_nao_saiu",
  "refeicao_pulada",
  "sensor_sem_leitura",
  "reiniciou",
  "offline",
] as const;

export type AlertType = (typeof ALERT_TYPES)[number];

export type Alert = {
  type: AlertType;
  message: string;
  openedAt: Date;
  notifiedAt: Date | null;
};

export interface AlertRepository {
  listOpen(): Promise<Alert[]>;
  // Devolve false quando já existe um alerta aberto desse tipo (R14).
  open(alert: Alert): Promise<boolean>;
  markNotified(type: AlertType, at: Date): Promise<void>;
  close(type: AlertType): Promise<void>;
}

// Os avisos de UM comedouro. Quem monta o comedouro liga isto ao dono dele.
export interface Notifier {
  notify(title: string, body: string): Promise<void>;
}

// Manda uma notificação para todos os aparelhos de uma pessoa (D16).
export interface UserNotifier {
  notify(userId: string, title: string, body: string): Promise<void>;
}

export type PushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

// Cada inscrição é de uma pessoa: o celular de quem ativou as notificações.
export interface PushSubscriptionRepository {
  add(userId: string, subscription: PushSubscription): Promise<void>;
  listByUser(userId: string): Promise<PushSubscription[]>;
  remove(endpoint: string): Promise<void>;
}

export interface FeederProfileRepository {
  findById(id: string): Promise<FeederProfile | null>;
  listByOwner(ownerId: string): Promise<FeederProfile[]>;
  listAll(): Promise<FeederProfile[]>;
  // Cria ou substitui.
  save(profile: FeederProfile): Promise<void>;
  remove(id: string): Promise<void>;
}

// Os repositórios de um comedouro, separados pelo id dele.
export type FeederRepositories = {
  feeder: FeederRepository;
  events: DeviceEventRepository;
  status: DeviceStatusRepository;
  alerts: AlertRepository;
};

export interface FeederStorage {
  forFeeder(feederId: string): FeederRepositories;
  // Apaga tudo o que é daquele comedouro: agenda, configuração, histórico, estado e alertas.
  purge(feederId: string): Promise<void>;
}

// O usuário e a senha MQTT de um aparelho. A senha fica só como hash.
export type DeviceCredential = {
  feederId: string;
  username: string;
  passwordHash: string;
};

export interface DeviceCredentialRepository {
  findByUsername(username: string): Promise<DeviceCredential | null>;
  save(credential: DeviceCredential): Promise<void>;
  removeByFeeder(feederId: string): Promise<void>;
}

// Um dispositivo pronto para ligar a um comedouro.
export type DeviceHandle = {
  device: Device;
  // Só nos simulados: o "mundo físico" de mentira.
  simulator: SimulatorControls | null;
  // Começa a rodar (o simulado passa a seguir a agenda sozinho).
  run(): void;
  // Esquece o comedouro: o aparelho removido não recebe mais a configuração antiga.
  forget(): Promise<void>;
};

export interface DeviceFactory {
  // false quando o servidor não tem broker MQTT: aí só dá para criar comedouros simulados.
  readonly supportsHardware: boolean;
  create(feederId: string, kind: FeederKind): DeviceHandle;
}

export interface PetRepository {
  findById(id: string): Promise<Pet | null>;
  listByOwner(ownerId: string): Promise<Pet[]>;
  // Cria ou substitui.
  save(pet: Pet): Promise<void>;
  remove(id: string): Promise<void>;
}

// A foto fica separada do pet: listar os pets não carrega as imagens.
export interface PetPhotoRepository {
  get(petId: string): Promise<PetPhoto | null>;
  save(petId: string, photo: PetPhoto): Promise<void>;
  remove(petId: string): Promise<void>;
}

// Confere a credencial que o app recebeu do Google. Devolve null se ela for falsa, vencida ou de outro app.
export interface IdentityVerifier {
  verify(credential: string): Promise<Identity | null>;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByGoogleSub(sub: string): Promise<User | null>;
  // Cria ou substitui.
  save(user: User): Promise<void>;
}

// Uma sessão aberta. O token fica só no cookie do navegador; aqui fica o hash dele.
export type Session = {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  renewedAt: Date;
};

export interface SessionRepository {
  add(session: Session): Promise<void>;
  // Devolve a sessão mesmo vencida: quem decide se ainda vale é o caso de uso.
  find(tokenHash: string): Promise<Session | null>;
  update(session: Session): Promise<void>;
  remove(tokenHash: string): Promise<void>;
}

// O "mundo físico" do dispositivo simulado. Só existe no modo demonstração.
export interface SimulatorControls {
  setBowlGrams(grams: number): void;
  setBottleGrams(grams: number): void;
  setSensors(sensors: { scale: boolean; level: boolean }): void;
  state(): DeviceState;
}
