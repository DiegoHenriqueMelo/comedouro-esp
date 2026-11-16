import { useEffect, useRef, useState } from "react";
import { api, type LoginOptions, type User } from "../api";
import { renderGoogleButton } from "../google";
import { useLoad } from "../hooks";
import { messageFor } from "../messages";
import { Card, LoadError, Loading, Notice } from "../ui";

// A única tela antes da sessão. Ela responde "o que é isto?" e oferece uma ação só: entrar.
export function LoginPage(props: { onLogin: (user: User) => void }) {
  const options = useLoad(api.loginOptions);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const login = async (attempt: () => Promise<{ usuario: User }>) => {
    setBusy(true);
    setError(null);
    try {
      const { usuario } = await attempt();
      props.onLogin(usuario);
    } catch (err) {
      setError(messageFor(err));
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <main className="page login">
        <img className="login-logo" src="/logo.svg" alt="" />
        <h1 className="login-title">Comedouro</h1>
        <p className="legend login-lead">
          Entre para acompanhar e ajustar a alimentação do seu gato, de onde
          estiver.
        </p>

        {options.loading && <Loading />}
        {!options.loading && !options.data && (
          <LoadError
            message={messageFor(options.error)}
            onRetry={options.reload}
          />
        )}
        {options.data && (
          <LoginCard
            options={options.data}
            busy={busy}
            onGoogle={(credencial) => login(() => api.loginGoogle(credencial))}
            onDev={() => login(api.loginDev)}
          />
        )}

        {error && <Notice tone="bad">{error}</Notice>}
      </main>
    </div>
  );
}

export function LoginCard(props: {
  options: LoginOptions;
  busy: boolean;
  onGoogle: (credential: string) => void;
  onDev: () => void;
}) {
  const { google, dev } = props.options;

  if (!google && !dev) {
    return (
      <Notice tone="warn" title="Nenhuma forma de entrar configurada">
        Defina o GOOGLE_CLIENT_ID no servidor. O passo a passo está no guia.
      </Notice>
    );
  }

  return (
    <Card>
      {google && (
        <GoogleButton clientId={google} onCredential={props.onGoogle} />
      )}
      {dev && (
        <button
          type="button"
          className="button"
          disabled={props.busy}
          onClick={props.onDev}
        >
          {props.busy ? "Entrando…" : "Entrar como dev"}
        </button>
      )}
      {dev && (
        <p className="legend">
          “Entrar como dev” só existe fora de produção e dispensa o Google.
        </p>
      )}
    </Card>
  );
}

function GoogleButton(props: {
  clientId: string;
  onCredential: (credential: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(props.onCredential);
  callback.current = props.onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    renderGoogleButton(element, props.clientId, (credential) =>
      callback.current(credential),
    ).catch(() => setFailed(true));
  }, [props.clientId]);

  if (failed) {
    return (
      <Notice tone="bad" title="O botão do Google não carregou">
        Confira a conexão e recarregue a página.
      </Notice>
    );
  }
  return <div ref={ref} className="google-button" />;
}
