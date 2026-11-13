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

export type Status = {
  hora: string;
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
  let response: Response;
  try {
    response = await fetch(`/v1${path}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  } catch {
    throw new ApiError(0, "sem_conexao");
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.motivo ?? "erro_interno",
      data?.mensagem ?? null,
    );
  }
  return data as T;
}

export const api = {
  status: () => request<Status>("GET", "/status"),
  feed: (porcoes: number, forcar = false) =>
    request<unknown>("POST", "/feed", { porcoes, forcar }),

  schedules: () =>
    request<{ versao: number; agenda: ScheduleItem[] }>("GET", "/schedules"),
  saveSchedules: (agenda: ScheduleItem[]) =>
    request<{ versao: number; agenda: ScheduleItem[] }>(
      "PUT",
      "/schedules",
      agenda,
    ),

  config: () =>
    request<{ versao: number; config: Config; fusos: string[] }>(
      "GET",
      "/config",
    ),
  saveConfig: (config: Config) =>
    request<{ versao: number; config: Config; fusos: string[] }>(
      "PUT",
      "/config",
      config,
    ),

  history: (limit: number) =>
    request<HistoryItem[]>("GET", `/history?limit=${limit}`),

  acknowledgeAlerts: () => request<unknown>("POST", "/alerts/ack"),
  tare: () => request<unknown>("POST", "/scale/tare"),
  calibrateScale: (gramas: number) =>
    request<unknown>("POST", "/scale/calibrate", { gramas }),
  calibrateDose: (porcoes: number) =>
    request<unknown>("POST", "/calibrate", { porcoes }),
  testServo: (angulo: number) =>
    request<unknown>("POST", "/servo/test", { angulo }),

  pushPublicKey: () =>
    request<{ chave: string | null }>("GET", "/push/public-key"),
  pushSubscribe: (subscription: PushSubscriptionJSON) =>
    request<unknown>("POST", "/push/subscribe", subscription),
  pushUnsubscribe: (endpoint: string) =>
    request<unknown>("POST", "/push/unsubscribe", { endpoint }),
  pushTest: () => request<unknown>("POST", "/push/test"),

  simulate: (changes: {
    tigelaGramas?: number;
    garrafaGramas?: number;
    balanca?: boolean;
    nivel?: boolean;
  }) => request<unknown>("POST", "/simulador", changes),
};
