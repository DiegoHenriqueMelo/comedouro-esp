import { useEffect, useState } from "react";
import { api, type User } from "../api";
import { useAction } from "../hooks";
import { messageFor } from "../messages";
import { disablePush, enablePush, getPushState, type PushState } from "../push";
import { signOut } from "../session";
import { Card, FeedbackLine } from "../ui";

// O que é da conta, e não de um comedouro: quem está logado e as notificações deste aparelho.

const PUSH_TEXT: Record<PushState, string> = {
  sem_suporte:
    "Este navegador não recebe notificações. No iPhone, instale o app na tela inicial antes. O endereço também precisa ser HTTPS.",
  servidor_desligado:
    "O servidor está sem as chaves de notificação. Veja o guia de configuração.",
  bloqueado:
    "As notificações estão bloqueadas para este site. Libere nas configurações do navegador.",
  desativado: "As notificações estão desativadas neste aparelho.",
  ativado: "Este aparelho recebe os avisos do comedouro.",
};

export function Account(props: { user: User }) {
  const action = useAction();

  return (
    <Card title="Sua conta">
      <div className="account">
        {props.user.foto && (
          <img
            className="account-photo"
            src={props.user.foto}
            alt=""
            referrerPolicy="no-referrer"
          />
        )}
        <div className="list-text">
          <span>{props.user.nome}</span>
          <span className="legend">{props.user.email}</span>
        </div>
      </div>
      <FeedbackLine feedback={action.feedback} />
      <button
        type="button"
        className="button"
        disabled={action.busy}
        onClick={() =>
          void action.run(signOut, { ok: "Você saiu.", error: messageFor })
        }
      >
        {action.busy ? "Saindo…" : "Sair"}
      </button>
    </Card>
  );
}

export function Notifications() {
  const [state, setState] = useState<PushState | null>(null);
  const action = useAction();

  useEffect(() => {
    getPushState()
      .then(setState)
      .catch(() => setState("sem_suporte"));
  }, []);

  const change = (work: () => Promise<PushState>, ok: string) =>
    void action.run(async () => setState(await work()), {
      ok,
      error: (err) => messageFor(err),
    });

  return (
    <Card title="Notificações">
      <p className="legend">{state ? PUSH_TEXT[state] : "Verificando…"}</p>
      {state === "desativado" && (
        <button
          type="button"
          className="button"
          disabled={action.busy}
          onClick={() => change(enablePush, "Notificações ativadas.")}
        >
          Ativar neste aparelho
        </button>
      )}
      {state === "ativado" && (
        <div className="inline">
          <button
            type="button"
            className="button"
            disabled={action.busy}
            onClick={() =>
              void action.run(api.pushTest, {
                ok: "Teste enviado: a notificação chega em instantes.",
                error: (err) => messageFor(err),
              })
            }
          >
            Enviar um teste
          </button>
          <button
            type="button"
            className="button button-quiet"
            disabled={action.busy}
            onClick={() => change(disablePush, "Notificações desativadas.")}
          >
            Desativar
          </button>
        </div>
      )}
      <FeedbackLine feedback={action.feedback} />
    </Card>
  );
}
