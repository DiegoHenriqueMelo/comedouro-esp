// O botão "Fazer login com o Google" (Google Identity Services).
// O Google desenha o botão e, quando a pessoa escolhe a conta, entrega uma credencial (um "ID token")
// que o app manda ao servidor. Quem confere a credencial é o servidor, nunca o app.

const SCRIPT_URL = "https://accounts.google.com/gsi/client";

type GoogleId = {
  initialize(options: {
    client_id: string;
    callback: (response: { credential: string }) => void;
  }): void;
  renderButton(element: HTMLElement, options: Record<string, unknown>): void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

let loading: Promise<GoogleId> | null = null;

function loadScript(): Promise<GoogleId> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const id = window.google?.accounts.id;
      if (id) resolve(id);
      else reject(new Error("o script do Google carregou sem a API"));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("não foi possível carregar o script do Google"));
    };
    document.head.append(script);
  });
  return loading;
}

export async function renderGoogleButton(
  element: HTMLElement,
  clientId: string,
  onCredential: (credential: string) => void,
): Promise<void> {
  const google = await loadScript();
  google.initialize({
    client_id: clientId,
    callback: (response) => onCredential(response.credential),
  });
  google.renderButton(element, {
    type: "standard",
    theme: "outline",
    size: "large",
    shape: "rectangular",
    text: "continue_with",
    locale: "pt-BR",
    width: Math.min(element.clientWidth || 320, 400),
  });
}
