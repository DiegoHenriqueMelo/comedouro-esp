import { useState } from "react";
import { api, type Status } from "../api";
import { useAction, useLoad } from "../hooks";
import {
  alertTitle,
  alertTone,
  canForce,
  formatGrams,
  messageFor,
  needsAcknowledge,
  situation,
} from "../messages";
import {
  Card,
  FeedbackLine,
  LoadError,
  Loading,
  Meter,
  Notice,
  StateLine,
  Stepper,
} from "../ui";

// A tela inicial segue a hierarquia do guia: "está tudo bem?", depois a ação, depois os números.
export function HomePage(props: { feederId: string }) {
  const status = useLoad(() => api.status(props.feederId), 3000);

  if (status.loading) return <Loading />;
  if (!status.data) {
    return (
      <LoadError
        message={messageFor(status.error)}
        onRetry={() => void status.reload()}
      />
    );
  }

  const s = status.data;
  return (
    <>
      <header className="page-header">
        <h1>{s.apelido}</h1>
        <div className="header-state">
          {s.simulado && <span className="legend">Simulado</span>}
          <StateLine tone={s.online ? "ok" : "bad"}>
            {s.online ? "Online" : "Offline"}
          </StateLine>
        </div>
      </header>

      <p className="situation">{situation(s)}</p>

      {status.error !== null && (
        <Notice tone="bad">
          {messageFor(status.error)} Mostrando os últimos dados recebidos.
        </Notice>
      )}

      <Alerts feederId={props.feederId} status={s} onDone={status.reload} />
      <ServeCard feederId={props.feederId} status={s} onDone={status.reload} />
      <Indicators status={s} />

      {s.config.sincronizado ? (
        <p className="legend center">
          Configuração sincronizada com o comedouro
        </p>
      ) : (
        <p className="center">
          <StateLine tone="warn">
            Configuração pendente: o comedouro aplica quando estiver online
          </StateLine>
        </p>
      )}
    </>
  );
}

// O bloco principal da tela: servir agora.
export function ServeCard(props: {
  feederId: string;
  status: Status;
  onDone: () => Promise<void>;
}) {
  const [porcoes, setPorcoes] = useState(1);
  const [refused, setRefused] = useState<unknown>(null);
  const action = useAction();
  const serving = props.status.estado === "servindo";

  const serve = async (forcar: boolean) => {
    setRefused(null);
    await action.run(
      async () => {
        try {
          await api.feed(props.feederId, porcoes, forcar);
        } catch (err) {
          setRefused(err);
          throw err;
        }
      },
      {
        ok: porcoes === 1 ? "Porção a caminho." : "Porções a caminho.",
        error: (err) => messageFor(err, props.status),
      },
    );
    await props.onDone();
  };

  return (
    <section className="main-block" aria-label="Servir">
      <div className="main-block-row">
        <Stepper
          value={porcoes}
          min={1}
          max={10}
          onChange={setPorcoes}
          label="Quantidade de porções"
          disabled={action.busy}
        />
        <span>{porcoes === 1 ? "porção" : "porções"}</span>
      </div>
      <button
        type="button"
        className="button button-primary button-tall"
        disabled={action.busy || serving}
        onClick={() => void serve(false)}
      >
        {serving ? "Servindo…" : "Servir agora"}
      </button>
      <FeedbackLine feedback={action.feedback} />
      {canForce(refused) && (
        <button
          type="button"
          className="button"
          disabled={action.busy}
          onClick={() => void serve(true)}
        >
          Servir mesmo assim
        </button>
      )}
    </section>
  );
}

function Alerts(props: {
  feederId: string;
  status: Status;
  onDone: () => Promise<void>;
}) {
  const action = useAction();
  const { alertas } = props.status;
  if (alertas.length === 0) return null;

  const acknowledge = async () => {
    await action.run(() => api.acknowledgeAlerts(props.feederId), {
      ok: "Alertas fechados.",
      error: (err) => messageFor(err),
    });
    await props.onDone();
  };

  // Do mais grave para o menos grave.
  const ordered = [...alertas].sort(
    (a, b) =>
      Number(alertTone(a.tipo) === "warn") -
      Number(alertTone(b.tipo) === "warn"),
  );

  return (
    <section className="notices" aria-label="Alertas">
      {ordered.map((alerta) => (
        <Notice
          key={alerta.tipo}
          tone={alertTone(alerta.tipo)}
          title={alertTitle(alerta.tipo)}
          action={
            needsAcknowledge(alerta.tipo) && (
              <button
                type="button"
                className="button"
                disabled={action.busy}
                onClick={() => void acknowledge()}
              >
                Entendi
              </button>
            )
          }
        >
          {alerta.mensagem}
        </Notice>
      ))}
      {action.feedback?.tone === "bad" && (
        <FeedbackLine feedback={action.feedback} />
      )}
    </section>
  );
}

function Indicators(props: { status: Status }) {
  const s = props.status;
  const percent = s.garrafa?.percentual ?? null;
  const days = s.garrafa?.diasRestantes ?? null;
  const bowl = s.tigela?.gramas ?? null;

  return (
    <>
      <Card title="Hoje">
        <p className="number">
          {s.hoje.porcoes}
          <span className="number-unit">
            {" "}
            de {s.limites.limiteDiarioPorcoes} porções
          </span>
        </p>
        <Meter
          value={s.hoje.porcoes}
          max={s.limites.limiteDiarioPorcoes}
          label="Porções de hoje"
        />
        <p className="legend">{formatGrams(s.hoje.gramas)} servidos</p>
      </Card>

      <div className="grid">
        <Card title="Garrafa">
          {percent === null ? (
            <StateLine tone="bad">Sem leitura</StateLine>
          ) : (
            <>
              <p className="number">
                {Math.round(percent)}
                <span className="number-unit"> %</span>
              </p>
              <Meter value={percent} max={100} label="Nível da garrafa" />
              {percent < 20 ? (
                <StateLine tone="warn">Ração acabando</StateLine>
              ) : (
                <p className="legend">
                  {days === null
                    ? "Sem agenda para estimar"
                    : `Dá para ${days} ${days === 1 ? "dia" : "dias"}`}
                </p>
              )}
            </>
          )}
        </Card>

        <Card title="Tigela">
          {bowl === null ? (
            <StateLine tone="bad">Sem leitura</StateLine>
          ) : (
            <>
              <p className="number">{formatGrams(bowl)}</p>
              <p className="legend">
                {bowl > s.limites.limiteTigelaGramas
                  ? "Ainda tem ração"
                  : "Vazia"}
              </p>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
