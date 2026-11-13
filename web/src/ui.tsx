import type { ReactNode } from "react";
import type { Feedback } from "./hooks";

// Peças pequenas de interface, usadas em todas as telas.

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

export function Chip(props: {
  tone: "ok" | "warn" | "bad" | "muted";
  children: ReactNode;
}) {
  return <span className={`chip chip-${props.tone}`}>{props.children}</span>;
}

// Uma barra de progresso de 0 a 100%.
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

export function FeedbackLine(props: { feedback: Feedback }) {
  if (!props.feedback) return null;
  return (
    <p
      className={`feedback feedback-${props.feedback.tone}`}
      role={props.feedback.tone === "bad" ? "alert" : "status"}
    >
      {props.feedback.text}
    </p>
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

export function Field(props: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: o campo vem em `children`, dentro do label
    <label className="field">
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  );
}

export function Loading() {
  return <p className="muted center">Carregando…</p>;
}

export function LoadError(props: { message: string; onRetry: () => void }) {
  return (
    <div className="card center">
      <p role="alert">{props.message}</p>
      <button type="button" className="button" onClick={props.onRetry}>
        Tentar de novo
      </button>
    </div>
  );
}

// Aceita vírgula ou ponto: "6,5" e "6.5" viram 6.5. Texto que não é número vira NaN.
export function parseNumber(text: string): number {
  const trimmed = text.trim().replace(",", ".");
  return trimmed === "" ? Number.NaN : Number(trimmed);
}
