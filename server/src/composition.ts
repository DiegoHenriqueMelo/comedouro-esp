import { AuthService } from "./application/auth-service.js";
import { FeederCatalog } from "./application/feeder-catalog.js";
import { PetService } from "./application/pet-service.js";
import type {
  Clock,
  DeviceCredentialRepository,
  DeviceFactory,
  FeederProfileRepository,
  FeederStorage,
  IdentityVerifier,
  PairingCodeRepository,
  PetPhotoRepository,
  PetRepository,
  SessionRepository,
  UserNotifier,
  UserRepository,
} from "./application/ports.js";

type Log = {
  warn(obj: unknown, msg: string): void;
  error(obj: unknown, msg: string): void;
};

export type SystemParts = {
  profiles: FeederProfileRepository;
  storage: FeederStorage;
  devices: DeviceFactory;
  credentials: DeviceCredentialRepository;
  codes: PairingCodeRepository;
  notifier: UserNotifier;
  clock: Clock;
  users: UserRepository;
  sessions: SessionRepository;
  pets: PetRepository;
  petPhotos: PetPhotoRepository;
  // null quando o login com Google não foi configurado.
  identityVerifier: IdentityVerifier | null;
  log?: Log;
};

export type System = ReturnType<typeof buildSystem>;

// Monta os casos de uso a partir dos adaptadores. O `main.ts` passa os de verdade; os testes, os de memória.
export function buildSystem(parts: SystemParts) {
  const catalog = new FeederCatalog({
    profiles: parts.profiles,
    storage: parts.storage,
    devices: parts.devices,
    credentials: parts.credentials,
    codes: parts.codes,
    notifier: parts.notifier,
    clock: parts.clock,
    ...(parts.log ? { log: parts.log } : {}),
  });

  const auth = new AuthService(
    parts.users,
    parts.sessions,
    parts.identityVerifier,
    parts.clock,
  );

  const pets = new PetService(parts.pets, parts.petPhotos, parts.clock);

  return { catalog, auth, pets, clock: parts.clock };
}
