import { useCallback, useEffect, useRef, useState } from "react";

export type Loadable<T> = {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
};

// Carrega um dado da API e, se `intervalMs` for dado, atualiza de tempos em tempos enquanto a aba está visível.
export function useLoad<T>(
  load: () => Promise<T>,
  intervalMs?: number,
): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    if (!intervalMs) return;

    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload, intervalMs]);

  return { data, error, loading, reload };
}

export type Feedback = { tone: "ok" | "bad"; text: string } | null;

// Uma ação com botão: enquanto roda, o botão fica desabilitado; o resultado vira uma mensagem.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const run = useCallback(
    async (
      action: () => Promise<unknown>,
      messages: { ok: string; error: (err: unknown) => string },
    ) => {
      setBusy(true);
      setFeedback(null);
      try {
        await action();
        setFeedback({ tone: "ok", text: messages.ok });
        return true;
      } catch (err) {
        setFeedback({ tone: "bad", text: messages.error(err) });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return { busy, feedback, run, setFeedback };
}
