import { ApiError, type HistoryItem, type Status } from "./api";

// Traduz os códigos do servidor em frases para quem usa o app.

const MOTIVOS: Record<string, string> = {
  // o dispositivo recusou
  limite_diario: "Limite de hoje atingido.",
  intervalo: "Ainda não deu o intervalo mínimo desde a última refeição.",
  tigela_com_racao: "A tigela ainda tem ração.",
  ocupado: "O alimentador está ocupado. Tente de novo em instantes.",
  alimentador_offline: "O alimentador está offline.",
  // regras da agenda e da configuração
  agenda_cheia: "A agenda aceita no máximo 8 refeições.",
  horario_repetido: "Há duas refeições no mesmo horário.",
  horario_invalido: "Há um horário inválido.",
  porcoes_invalidas: "As porções vão de 1 a 10 por refeição.",
  agenda_acima_do_limite: "As refeições ativas somam mais que o limite diário.",
  horarios_muito_proximos:
    "Há duas refeições ativas mais próximas que o intervalo mínimo.",
  gramas_por_porcao_invalido: "Gramas por porção: maior que 0 e até 30.",
  limite_diario_invalido: "Limite diário: de 1 a 30 porções.",
  intervalo_minimo_invalido: "Intervalo mínimo: de 15 a 720 minutos.",
  limite_tigela_invalido: "Limite da tigela: de 0 a 100 g.",
  fuso_invalido: "Fuso horário desconhecido.",
  altura_garrafa_invalida: "Altura da garrafa: de 50 a 500 mm.",
  angulos_invalidos:
    "Os ângulos vão de 0° a 180° e precisam ser diferentes entre si.",
  conflito_de_versao:
    "Outra pessoa alterou os dados ao mesmo tempo. Recarregue e tente de novo.",
  // gerais
  requisicao_invalida: "Confira os campos preenchidos.",
  sem_conexao: "Sem conexão com o servidor.",
  erro_interno: "Algo deu errado no servidor. Tente de novo.",
};

export function messageFor(error: unknown, status?: Status | null): string {
  if (!(error instanceof ApiError)) return MOTIVOS.erro_interno as string;

  if (error.motivo === "tigela_com_racao") {
    const gramas = status?.tigela?.gramas;
    if (gramas !== null && gramas !== undefined) {
      return `A tigela ainda tem ${formatGrams(gramas)}.`;
    }
  }
  if (error.motivo === "ocupado" && status?.estado === "vazio") {
    return "O alimentador está parado: a última porção não saiu. Confira a garrafa e toque em “Entendi”.";
  }
  return MOTIVOS[error.motivo] ?? (MOTIVOS.erro_interno as string);
}

// Só a recusa pela tigela pode ser contornada com "servir mesmo assim".
export function canForce(error: unknown): boolean {
  return error instanceof ApiError && error.motivo === "tigela_com_racao";
}

const ORIGENS: Record<string, string> = {
  agenda: "agenda",
  interface: "app",
  alexa: "Alexa",
};

export function originLabel(origem: string | null): string {
  return origem ? (ORIGENS[origem] ?? origem) : "";
}

const RECUSAS: Record<string, string> = {
  limite_diario: "limite diário",
  intervalo: "intervalo mínimo",
  tigela_com_racao: "tigela com ração",
  balanca: "balança",
  nivel: "sensor de nível",
};

export type HistoryLine = {
  title: string;
  detail: string;
  tone: "ok" | "warn" | "bad";
};

export function historyLine(item: HistoryItem): HistoryLine {
  const porcoes =
    item.porcoes === null
      ? ""
      : `${item.porcoes} ${item.porcoes === 1 ? "porção" : "porções"}`;
  const origem = originLabel(item.origem);
  const motivo = item.motivo ? (RECUSAS[item.motivo] ?? item.motivo) : "";
  const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

  switch (item.tipo) {
    case "refeicao_servida":
      return {
        title: "Refeição servida",
        detail: join(
          porcoes,
          item.gramas === null ? "" : formatGrams(item.gramas),
          origem,
        ),
        tone: "ok",
      };
    case "refeicao_recusada":
      return {
        title: "Pedido recusado",
        detail: join(motivo, porcoes, origem),
        tone: "warn",
      };
    case "refeicao_adiada":
      return {
        title: "Refeição adiada",
        detail: join("tigela com ração", porcoes),
        tone: "warn",
      };
    case "refeicao_pulada":
      return {
        title: "Refeição pulada",
        detail: join("a tigela ficou com ração por 2 h", porcoes),
        tone: "bad",
      };
    case "garrafa_vazia":
      return {
        title: "A porção não saiu",
        detail: "garrafa vazia ou comporta travada",
        tone: "bad",
      };
    case "sensor_sem_leitura":
      return { title: "Sensor sem leitura", detail: motivo, tone: "bad" };
    case "reiniciou":
      return { title: "O alimentador reiniciou", detail: "", tone: "warn" };
    default:
      return { title: item.tipo, detail: "", tone: "warn" };
  }
}

const ALERTAS: Record<string, string> = {
  garrafa_baixa: "Ração acabando",
  porcao_nao_saiu: "A porção não saiu",
  refeicao_pulada: "Refeição pulada",
  sensor_sem_leitura: "Sensor sem leitura",
  reiniciou: "O alimentador reiniciou",
  offline: "Alimentador offline",
};

export function alertTitle(tipo: string): string {
  return ALERTAS[tipo] ?? tipo;
}

// Os alertas que só somem quando alguém toca em "Entendi".
export function needsAcknowledge(tipo: string): boolean {
  return ["porcao_nao_saiu", "refeicao_pulada", "reiniciou"].includes(tipo);
}

export function formatGrams(gramas: number): string {
  const rounded = Math.round(gramas * 10) / 10;
  return `${rounded.toLocaleString("pt-BR")} g`;
}

export function formatTime(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

// "hoje", "ontem" ou "seg., 9 de nov."
export function formatDay(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const key = (d: Date) => d.toLocaleDateString("pt-BR");
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  if (key(date) === key(now)) return "Hoje";
  if (key(date) === key(yesterday)) return "Ontem";
  return date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// A soma das porções ativas: o que a regra do limite diário olha.
export function activePortions(
  agenda: { porcoes: number; ativo: boolean }[],
): number {
  return agenda.filter((m) => m.ativo).reduce((sum, m) => sum + m.porcoes, 0);
}
