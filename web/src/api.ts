// O cliente da API /v1. Os tipos espelham o que o servidor devolve (server/src/http/routes.ts).

export type ScheduleItem = { hora: string; porcoes: number; ativo: boolean };

export type Config = {
  gramasPorPorcao: number;
  limiteDiarioPorcoes: number;
  intervaloMinimoMin: number;
  limiteTigelaGramas: number;
  fusoHorario: string;
  alturaGarrafaMm: number;
  anguloEncher: number;
  anguloServir: number;
};

export type Alert = { tipo: string; mensagem: string; desde: string };

export type FeederKind = "aparelho" | "simulado";

// Um comedouro na lista da conta.
export type FeederSummary = {
  id: string;
  apelido: string;
  tipo: FeederKind;
  criadoEm: string;
  online: boolean;
  alertas: number;
};

export type Species = "gato" | "cachorro";

export type Pet = {
  id: string;
  nome: string;
  especie: Species;
  // AAAA-MM-DD
  nascimento: string | null;
  pesoKg: number | null;
  // O endereço da foto (já com o ?v= da versão), ou null.
  foto: string | null;
  criadoEm: string;
};

export type PetInput = Omit<Pet, "id" | "foto" | "criadoEm">;

// O usuário e a senha MQTT de um aparelho novo: o servidor mostra uma vez só.
export type DeviceCredential = { usuario: string; senha: string };

export type Status = {
  hora: string;
  apelido: string;
  tipo: FeederKind;
  online: boolean;
  onlineDesde: string | null;
  estado: "ocioso" | "servindo" | "vazio" | null;
  horaValida: boolean | null;
  proximaRefeicao: { hora: string; porcoes: number; amanha: boolean } | null;
  ultimaRefeicao: {
    hora: string;
    porcoes: number | null;
    gramas: number | null;
    origem: string | null;
  } | null;
  hoje: { porcoes: number; gramas: number };
  limites: {
    limiteDiarioPorcoes: number;
    intervaloMinimoMin: number;
    limiteTigelaGramas: number;
  };
  tigela: { gramas: number | null; estavel: boolean } | null;
  garrafa: { percentual: number | null; diasRestantes: number | null } | null;
  sensores: { balanca: boolean; nivel: boolean } | null;
  wifi: { rssi: number } | null;
  config: {
    versao: number;
    versaoAplicada: number | null;
    sincronizado: boolean;
  };
  alertas: Alert[];
  simulado: boolean;
};

export type HistoryItem = {
  seq: number;
  tipo: string;
  hora: string;
  porcoes: number | null;
  gramas: number | null;
  origem: string | null;
  motivo: string | null;
};

export type User = {
  id: string;
  nome: string;
  email: string;
  foto: string | null;
};

export type LoginOptions = {
  // O "ID do cliente OAuth" do Google; null quando o servidor não tem login com Google.
  google: string | null;
  // "Entrar como dev": só fora de produção.
  dev: boolean;
};

// Disparado quando a API responde 401: a sessão acabou (ou a pessoa saiu), e o app volta para o login.
export const SESSION_ENDED = "comedouro:sessao-encerrada";

// Um erro da API: o `motivo` é o código que o servidor devolveu (ex.: "limite_diario").
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly motivo: string,
    readonly detalhe: string | null = null,
  ) {
    super(motivo);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  // Uma imagem vai como ela mesma; o resto, como JSON.
  const init: RequestInit =
    body === undefined
      ? {}
      : body instanceof Blob
        ? { headers: { "Content-Type": body.type }, body }
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          };
  let response: Response;
  try {
    response = await fetch(`/v1${path}`, { method, ...init });
  } catch {
    throw new ApiError(0, "sem_conexao");
  }

  const data = await response.json().catch(() => null);
  if (response.status === 401 && !path.startsWith("/sessao")) {
    window.dispatchEvent(new Event(SESSION_ENDED));
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.motivo ?? "erro_interno",
      data?.mensagem ?? null,
    );
  }
  return data as T;
}

const feeder = (id: string) => `/comedouros/${encodeURIComponent(id)}`;
const pet = (id: string) => `/pets/${encodeURIComponent(id)}`;

export const api = {
  loginOptions: () => request<LoginOptions>("GET", "/sessao/opcoes"),
  loginGoogle: (credencial: string) =>
    request<{ usuario: User }>("POST", "/sessao", { credencial }),
  loginDev: () => request<{ usuario: User }>("POST", "/sessao/dev"),
  logout: () => request<null>("DELETE", "/sessao"),
  me: () => request<User>("GET", "/eu"),

  // Os comedouros da conta.
  feeders: () =>
    request<{ aparelhoDisponivel: boolean; comedouros: FeederSummary[] }>(
      "GET",
      "/comedouros",
    ),
  createFeeder: (apelido: string, tipo: FeederKind) =>
    request<{ comedouro: FeederSummary; credencial: DeviceCredential | null }>(
      "POST",
      "/comedouros",
      { apelido, tipo },
    ),
  renameFeeder: (id: string, apelido: string) =>
    request<FeederSummary>("PATCH", feeder(id), { apelido }),
  removeFeeder: (id: string) => request<null>("DELETE", feeder(id)),

  // Um comedouro.
  status: (id: string) => request<Status>("GET", `${feeder(id)}/status`),
  feed: (id: string, porcoes: number, forcar = false) =>
    request<unknown>("POST", `${feeder(id)}/feed`, { porcoes, forcar }),

  schedules: (id: string) =>
    request<{ versao: number; agenda: ScheduleItem[] }>(
      "GET",
      `${feeder(id)}/schedules`,
    ),
  saveSchedules: (id: string, agenda: ScheduleItem[]) =>
    request<{ versao: number; agenda: ScheduleItem[] }>(
      "PUT",
      `${feeder(id)}/schedules`,
      agenda,
    ),

  config: (id: string) =>
    request<{ versao: number; config: Config; fusos: string[] }>(
      "GET",
      `${feeder(id)}/config`,
    ),
  saveConfig: (id: string, config: Config) =>
    request<{ versao: number; config: Config; fusos: string[] }>(
      "PUT",
      `${feeder(id)}/config`,
      config,
    ),

  history: (id: string, limit: number) =>
    request<HistoryItem[]>("GET", `${feeder(id)}/history?limit=${limit}`),

  acknowledgeAlerts: (id: string) =>
    request<unknown>("POST", `${feeder(id)}/alerts/ack`),
  tare: (id: string) => request<unknown>("POST", `${feeder(id)}/scale/tare`),
  calibrateScale: (id: string, gramas: number) =>
    request<unknown>("POST", `${feeder(id)}/scale/calibrate`, { gramas }),
  calibrateDose: (id: string, porcoes: number) =>
    request<unknown>("POST", `${feeder(id)}/calibrate`, { porcoes }),
  testServo: (id: string, angulo: number) =>
    request<unknown>("POST", `${feeder(id)}/servo/test`, { angulo }),

  simulate: (
    id: string,
    changes: {
      tigelaGramas?: number;
      garrafaGramas?: number;
      balanca?: boolean;
      nivel?: boolean;
    },
  ) => request<unknown>("POST", `${feeder(id)}/simulador`, changes),

  // Os pets da conta.
  pets: () => request<Pet[]>("GET", "/pets"),
  pet: (id: string) => request<Pet>("GET", pet(id)),
  createPet: (input: PetInput) => request<Pet>("POST", "/pets", input),
  updatePet: (id: string, input: PetInput) =>
    request<Pet>("PUT", pet(id), input),
  removePet: (id: string) => request<null>("DELETE", pet(id)),
  uploadPetPhoto: (id: string, photo: Blob) =>
    request<Pet>("PUT", `${pet(id)}/foto`, photo),
  removePetPhoto: (id: string) => request<Pet>("DELETE", `${pet(id)}/foto`),

  // Notificações: são da conta, não de um comedouro.
  pushPublicKey: () =>
    request<{ chave: string | null }>("GET", "/push/public-key"),
  pushSubscribe: (subscription: PushSubscriptionJSON) =>
    request<unknown>("POST", "/push/subscribe", subscription),
  pushUnsubscribe: (endpoint: string) =>
    request<unknown>("POST", "/push/unsubscribe", { endpoint }),
  pushTest: () => request<unknown>("POST", "/push/test"),
};
