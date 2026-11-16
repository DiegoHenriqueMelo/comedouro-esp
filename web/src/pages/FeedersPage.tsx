import { useState } from "react";
import {
  api,
  type DeviceCredential,
  type FeederKind,
  type FeederSummary,
  type User,
} from "../api";
import { type Tone, useAction, useLoad } from "../hooks";
import { fieldFor, messageFor } from "../messages";
import { feederPath, navigate } from "../router";
import {
  Card,
  FeedbackLine,
  Field,
  Icon,
  LoadError,
  Loading,
  Notice,
  StateLine,
} from "../ui";
import { Account, Notifications } from "./AccountCards";

// A primeira tela depois do login: os comedouros da conta. Tocar num deles abre as telas dele.
export function FeedersPage(props: { user: User }) {
  const feeders = useLoad(api.feeders, 5000);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<{
    comedouro: FeederSummary;
    credencial: DeviceCredential;
  } | null>(null);

  if (feeders.loading) return <Loading />;
  if (!feeders.data) {
    return (
      <LoadError
        message={messageFor(feeders.error)}
        onRetry={() => void feeders.reload()}
      />
    );
  }

  const { comedouros, aparelhoDisponivel } = feeders.data;
  const empty = comedouros.length === 0;

  return (
    <>
      <header className="page-header">
        <h1>Comedouros</h1>
      </header>

      {created && (
        <NewDeviceCredential
          apelido={created.comedouro.apelido}
          credencial={created.credencial}
          onClose={() => setCreated(null)}
        />
      )}

      {empty && !adding && (
        <p className="legend">
          Nenhum comedouro ainda. Adicione o seu, ou experimente um simulado,
          sem aparelho.
        </p>
      )}

      {!empty && (
        <Card>
          <ul className="list">
            {comedouros.map((c) => (
              <FeederItem key={c.id} feeder={c} />
            ))}
          </ul>
        </Card>
      )}

      {adding || empty ? (
        <AddFeeder
          hasSimulated={comedouros.some((c) => c.tipo === "simulado")}
          hardware={aparelhoDisponivel}
          cancelable={!empty}
          onCancel={() => setAdding(false)}
          onCreated={async (result) => {
            setAdding(false);
            if (result.credencial) {
              setCreated({
                comedouro: result.comedouro,
                credencial: result.credencial,
              });
              await feeders.reload();
            } else {
              navigate(feederPath(result.comedouro.id));
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="button"
          onClick={() => {
            setCreated(null);
            setAdding(true);
          }}
        >
          Adicionar comedouro
        </button>
      )}

      <Notifications />
      <Account user={props.user} />
    </>
  );
}

// O estado de um comedouro na lista, em palavras: um ponto sozinho não vale (guia, seção 5.4).
export function feederState(feeder: FeederSummary): {
  tone: Tone;
  text: string;
} {
  if (!feeder.online) return { tone: "bad", text: "Offline" };
  if (feeder.alertas > 0) {
    return {
      tone: "warn",
      text: feeder.alertas === 1 ? "1 aviso" : `${feeder.alertas} avisos`,
    };
  }
  return { tone: "ok", text: "Tudo certo" };
}

function FeederItem(props: { feeder: FeederSummary }) {
  const { feeder } = props;
  const state = feederState(feeder);
  return (
    <li className="list-item">
      <button
        type="button"
        className="feeder-item"
        onClick={() => navigate(feederPath(feeder.id))}
      >
        <span className="list-text">
          <span className="feeder-name">{feeder.apelido}</span>
          <StateLine tone={state.tone}>{state.text}</StateLine>
          {feeder.tipo === "simulado" && (
            <span className="legend">Simulado</span>
          )}
        </span>
        <Icon name="seguir" />
      </button>
    </li>
  );
}

const KINDS: { kind: FeederKind; label: string; hint: string }[] = [
  {
    kind: "aparelho",
    label: "Tenho um aparelho",
    hint: "Você recebe o usuário e a senha para gravar no ESP32.",
  },
  {
    kind: "simulado",
    label: "Experimentar sem aparelho",
    hint: "Um comedouro de mentira, que roda dentro do servidor.",
  },
];

function AddFeeder(props: {
  hasSimulated: boolean;
  hardware: boolean;
  cancelable: boolean;
  onCancel: () => void;
  onCreated: (result: {
    comedouro: FeederSummary;
    credencial: DeviceCredential | null;
  }) => Promise<void>;
}) {
  const [apelido, setApelido] = useState("");
  const [kind, setKind] = useState<FeederKind>(
    props.hardware ? "aparelho" : "simulado",
  );
  const [error, setError] = useState<string | null>(null);
  const action = useAction();

  const unavailable = (k: FeederKind) =>
    k === "aparelho"
      ? props.hardware
        ? null
        : "Este servidor ainda não tem broker MQTT."
      : props.hasSimulated
        ? "Você já tem um comedouro simulado."
        : null;

  const create = async () => {
    setError(null);
    let failure: unknown = null;
    let result: Awaited<ReturnType<typeof api.createFeeder>> | null = null;
    const ok = await action.run(
      async () => {
        try {
          result = await api.createFeeder(apelido, kind);
        } catch (err) {
          failure = err;
          throw err;
        }
      },
      { ok: "Comedouro adicionado.", error: (err) => messageFor(err) },
    );
    if (ok && result) {
      await props.onCreated(result);
    } else if (fieldFor(failure) === "apelido") {
      setError(messageFor(failure));
      action.setFeedback(null);
    }
  };

  return (
    <Card title="Adicionar comedouro">
      <Field
        label="Apelido"
        hint="Como você chama este comedouro: “Cozinha”, “Sala”."
        error={error}
      >
        <input
          className="input"
          autoComplete="off"
          maxLength={30}
          aria-invalid={error !== null}
          value={apelido}
          onChange={(e) => {
            setApelido(e.target.value);
            setError(null);
          }}
        />
      </Field>

      <fieldset className="choices">
        <legend className="field-label">Tipo</legend>
        {KINDS.map((k) => {
          const reason = unavailable(k.kind);
          return (
            <label
              key={k.kind}
              className={reason ? "choice choice-off" : "choice"}
            >
              <input
                type="radio"
                name="tipo"
                value={k.kind}
                checked={kind === k.kind}
                disabled={reason !== null}
                onChange={() => setKind(k.kind)}
              />
              <span className="list-text">
                <span>{k.label}</span>
                <span className="field-hint">{reason ?? k.hint}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <FeedbackLine feedback={action.feedback} />
      <div className="inline">
        <button
          type="button"
          className="button button-primary"
          disabled={action.busy || unavailable(kind) !== null}
          onClick={() => void create()}
        >
          {action.busy ? "Adicionando…" : "Adicionar"}
        </button>
        {props.cancelable && (
          <button
            type="button"
            className="button button-quiet"
            disabled={action.busy}
            onClick={props.onCancel}
          >
            Cancelar
          </button>
        )}
      </div>
    </Card>
  );
}

// A senha do aparelho aparece uma vez só: o servidor guarda apenas o hash dela.
function NewDeviceCredential(props: {
  apelido: string;
  credencial: DeviceCredential;
  onClose: () => void;
}) {
  return (
    <Notice
      tone="ok"
      title={`${props.apelido} foi adicionado`}
      action={
        <button type="button" className="button" onClick={props.onClose}>
          Já anotei
        </button>
      }
    >
      Grave estes dados no ESP32 (ou use no simulador). A senha não aparece de
      novo.
      <span className="credential">
        <span>
          Usuário: <code>{props.credencial.usuario}</code>
        </span>
        <span>
          Senha: <code>{props.credencial.senha}</code>
        </span>
      </span>
    </Notice>
  );
}
