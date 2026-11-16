import type { ReactNode } from "react";
import type { Feedback, Tone } from "./hooks";

// As peças de interface do guia de UI/UX (docs/UI-UX.md, seção 5). Toda tela é montada com elas.

// 5.2 Cartão: um assunto por cartão, com o título em frase normal.
export function Card(props: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${props.className ?? ""}`}>
      {props.title && <h2 className="card-title">{props.title}</h2>}
      {props.children}
    </section>
  );
}

// 5.4 Linha de estado: um ponto e o estado escrito. A cor nunca vai sozinha.
export function StateLine(props: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`state state-${props.tone}`}>
      <span className="state-dot" aria-hidden="true" />
      {props.children}
    </span>
  );
}

// 5.5 Aviso: o bloco inteiro com o fundo suave do estado, para o que pede atenção agora.
export function Notice(props: {
  tone: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={`notice notice-${props.tone}`}
      role={props.tone === "ok" ? "status" : "alert"}
    >
      {props.title && <strong>{props.title}</strong>}
      {props.children && <span>{props.children}</span>}
      {props.action}
    </div>
  );
}

export function FeedbackLine(props: { feedback: Feedback }) {
  if (!props.feedback) return null;
  return <Notice tone={props.feedback.tone}>{props.feedback.text}</Notice>;
}

// 5.9 A barra de um indicador. Ela não muda de cor: quem avisa é a linha de estado.
export function Meter(props: { value: number; max: number; label: string }) {
  const percent =
    props.max > 0
      ? Math.max(0, Math.min(100, (props.value / props.max) * 100))
      : 0;
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={props.label}
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="meter-fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

// Um contador com botões de menos e mais.
export function Stepper(props: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const { value, min, max, onChange } = props;
  return (
    <fieldset className="stepper" aria-label={props.label}>
      <button
        type="button"
        className="stepper-button"
        aria-label="Diminuir"
        disabled={props.disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        −
      </button>
      <output className="stepper-value">{value}</output>
      <button
        type="button"
        className="stepper-button"
        aria-label="Aumentar"
        disabled={props.disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        +
      </button>
    </fieldset>
  );
}

// 5.7 Campo: rótulo em cima, legenda embaixo, e o erro embaixo do campo que causou.
export function Field(props: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: o campo vem em `children`, dentro do label
    <label className="field">
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.error ? (
        <span className="field-error" role="alert">
          {props.error}
        </span>
      ) : (
        props.hint && <span className="field-hint">{props.hint}</span>
      )}
    </label>
  );
}

// 5.12 Carregando: só o texto, sem girador.
export function Loading() {
  return <p className="legend center">Carregando…</p>;
}

// 5.12 Erro: um aviso de problema com "Tentar de novo".
export function LoadError(props: { message: string; onRetry: () => void }) {
  return (
    <Notice
      tone="bad"
      action={
        <button type="button" className="button" onClick={props.onRetry}>
          Tentar de novo
        </button>
      }
    >
      {props.message}
    </Notice>
  );
}

// Aceita vírgula ou ponto: "6,5" e "6.5" viram 6.5. Texto que não é número vira NaN.
export function parseNumber(text: string): number {
  const trimmed = text.trim().replace(",", ".");
  return trimmed === "" ? Number.NaN : Number(trimmed);
}

// 5.8 Ícones: de linha, com traço de 1,5, na cor do texto ao redor.
const ICONS = {
  inicio: <path d="M4 11.2 12 4l8 7.2V20h-5.2v-5.6H9.2V20H4z" />,
  agenda: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  historico: <path d="M5 7h14M5 12h14M5 17h9" />,
  ajustes: (
    <>
      <path d="M4 8h8.5M17.5 8H20M4 16h2.5M11.5 16H20" />
      <circle cx="15" cy="8" r="2.5" />
      <circle cx="9" cy="16" r="2.5" />
    </>
  ),
  voltar: <path d="M14.5 6 8.5 12l6 6" />,
  foto: (
    <>
      <path d="M4 8.5h3l1.5-2h7L17 8.5h3V18H4z" />
      <circle cx="12" cy="13" r="3" />
    </>
  ),
  seguir: <path d="M9.5 6l6 6-6 6" />,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon(props: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[props.name]}
    </svg>
  );
}
