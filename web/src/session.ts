import { useCallback, useEffect, useState } from "react";
import { ApiError, api, SESSION_ENDED, type User } from "./api";

export type SessionState =
  | { status: "carregando" }
  | { status: "fora" }
  | { status: "dentro"; user: User }
  // Sem conexão ou servidor fora do ar: não dá para saber se a pessoa está logada.
  | { status: "erro"; error: unknown };

// Quem está usando o app. Começa perguntando ao servidor (o cookie é httpOnly: o app não o enxerga).
export function useSession() {
  const [state, setState] = useState<SessionState>({ status: "carregando" });

  const check = useCallback(async () => {
    setState({ status: "carregando" });
    try {
      setState({ status: "dentro", user: await api.me() });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState({ status: "fora" });
      } else {
        setState({ status: "erro", error });
      }
    }
  }, []);

  useEffect(() => {
    void check();
    const onEnded = () => setState({ status: "fora" });
    window.addEventListener(SESSION_ENDED, onEnded);
    return () => window.removeEventListener(SESSION_ENDED, onEnded);
  }, [check]);

  return {
    state,
    retry: check,
    signedIn: (user: User) => setState({ status: "dentro", user }),
  };
}

// Sai e avisa o app inteiro, que volta para a tela de login.
export async function signOut(): Promise<void> {
  await api.logout();
  window.dispatchEvent(new Event(SESSION_ENDED));
}
