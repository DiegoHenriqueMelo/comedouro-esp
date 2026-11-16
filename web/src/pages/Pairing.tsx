import { useEffect, useState } from "react";
import { api, type PairingCode } from "../api";
import { useAction } from "../hooks";
import { messageFor } from "../messages";
import { FeedbackLine, LoadError, Loading } from "../ui";

// "482913" vira "482 913": mais fácil de ler e de digitar.
export function formatCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

// Quanto falta, em "m:ss". Zero ou menos: venceu.
export function timeLeft(expiresAt: string, now: number): string | null {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return null;
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// O bloco do código de pareamento (D4). `fresh`: gera um código novo ao abrir (parear de novo).
// Sem `fresh`, mostra o que ainda vale, e só gera um se não houver.
export function PairingBlock(props: { feederId: string; fresh?: boolean }) {
  const [code, setCode] = useState<PairingCode | null>(null);
  const [error, setError] = useState<unknown>(null);
  const action = useAction();
  const now = useNow(1000);
  const { feederId, fresh } = props;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = fresh ? null : (await api.pairingCode(feederId)).codigo;
        const next = current ?? (await api.newPairingCode(feederId)).codigo;
        if (!cancelled) setCode(next);
      } catch (err) {
        if (!cancelled) setError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [feederId, fresh]);

  const renew = () =>
    void action.run(
      async () => setCode((await api.newPairingCode(feederId)).codigo),
      { ok: "Código novo gerado.", error: (err) => messageFor(err) },
    );

  if (error) {
    return (
      <LoadError
        message={messageFor(error)}
        onRetry={() => {
          setError(null);
          renew();
        }}
      />
    );
  }
  if (!code) return <Loading />;

  const left = timeLeft(code.expiraEm, now);
  return (
    <section className="main-block pairing" aria-label="Código de pareamento">
      <p className="pairing-label">Código de pareamento</p>
      <p className={left ? "pairing-code" : "pairing-code pairing-code-off"}>
        <span aria-hidden="true">{formatCode(code.codigo)}</span>
        {/* O leitor de tela lê dígito por dígito, e não "quatrocentos e oitenta e dois". */}
        <span className="visually-hidden">
          {code.codigo.split("").join(" ")}
        </span>
      </p>
      <p className="pairing-left">
        {left ? `Vale por ${left}.` : "Este código venceu."}
      </p>
      <ol className="pairing-steps">
        <li>Ligue o comedouro na tomada.</li>
        <li>
          No celular, entre na rede Wi-Fi <strong>Comedouro</strong> que ele
          cria. A página de configuração abre sozinha.
        </li>
        <li>Escolha o Wi-Fi da sua casa, digite a senha dele e este código.</li>
      </ol>
      <p className="legend">
        {fresh
          ? "Quando o comedouro conectar com este código, o aparelho que estava pareado antes deixa de funcionar."
          : "Quando o comedouro conectar, esta tela muda sozinha."}
      </p>
      <FeedbackLine feedback={action.feedback} />
      <button
        type="button"
        className={left ? "button" : "button button-primary"}
        disabled={action.busy}
        onClick={renew}
      >
        {action.busy ? "Gerando…" : "Gerar outro código"}
      </button>
    </section>
  );
}
