import { AlertService } from "./application/alert-service.js";
import { AuthService } from "./application/auth-service.js";
import { DeviceService } from "./application/device-service.js";
import { FeederService } from "./application/feeder-service.js";
import type {
  AlertRepository,
  Clock,
  Device,
  DeviceEventRepository,
  DeviceStatusRepository,
  FeederRepository,
  IdentityVerifier,
  Notifier,
  SessionRepository,
  UserRepository,
} from "./application/ports.js";

type Log = { warn(obj: unknown, msg: string): void };

export type SystemParts = {
  feederRepository: FeederRepository;
  eventRepository: DeviceEventRepository;
  statusRepository: DeviceStatusRepository;
  alertRepository: AlertRepository;
  device: Device;
  notifier: Notifier;
  clock: Clock;
  users: UserRepository;
  sessions: SessionRepository;
  // null quando o login com Google não foi configurado.
  identityVerifier: IdentityVerifier | null;
  log?: Log;
};

export type System = ReturnType<typeof buildSystem>;

// Monta os casos de uso a partir dos adaptadores. O `main.ts` passa os de verdade; os testes, os de memória.
export function buildSystem(parts: SystemParts) {
  const feeders = new FeederService(
    parts.feederRepository,
    parts.device,
    parts.log,
  );
  const alerts = new AlertService(
    parts.alertRepository,
    parts.notifier,
    parts.clock,
    parts.log,
  );
  const devices = new DeviceService(
    parts.device,
    parts.eventRepository,
    parts.statusRepository,
    feeders,
    alerts,
    parts.clock,
  );

  const auth = new AuthService(
    parts.users,
    parts.sessions,
    parts.identityVerifier,
    parts.clock,
  );

  return { feeders, alerts, devices, auth };
}
