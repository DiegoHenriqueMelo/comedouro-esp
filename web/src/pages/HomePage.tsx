import { useState } from "react";
import { api, type Status } from "../api";
import { useAction, useLoad } from "../hooks";
import {
  alertTitle,
  canForce,
  formatGrams,
  formatTime,
  messageFor,
  needsAcknowledge,
  originLabel,
} from "../messages";
import {
  Card,
  Chip,
  FeedbackLine,
  LoadError,
  Loading,
  Meter,
  Stepper,
} from "../ui";

export function HomePage() {
  const status = useLoad(api.status, 3000);

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
        <h1>Comedouro</h1>
        <div className="chips">
          {s.simulado && <Chip tone="muted">Simulado</Chip>}
          <Chip tone={s.online ? "ok" : "bad"}>
            {s.online ? "Online" : "Offline"}
          </Chip>
        </div>
      </header>

      {status.error !== null && (
        <p className="feedback feedback-bad" role="alert">
          {messageFor(status.error)} Mostrando os últimos dados recebidos.
        </p>
      )}

      <Alerts status={s} onDone={status.reload} />
      <ServeCard status={s} onDone={status.reload} />

      <div className="grid">
        <Card title="Hoje">
          <p className="big">
            {s.hoje.porcoes}
            <span className="big-unit">
              {" "}
              de {s.limites.limiteDiarioPorcoes} porções
            </span>
          </p>
          <Meter
            value={s.hoje.porcoes}
            max={s.limites.limiteDiarioPorcoes}
            label="Porções de hoje"
          />
          <p className="muted">{formatGrams(s.hoje.gramas)} servidos</p>
        </Card>

        <Card title="Garrafa">
          {s.garrafa?.percentual === null ||
          s.garrafa?.percentual === undefined ? (
            <p className="muted">Sem leitura</p>
          ) : (
            <>
              <p className="big">
                {Math.round(s.garrafa.percentual)}
                <span className="big-unit">%</span>
              </p>
              <Meter
                value={s.garrafa.percentual}
                max={100}
                label="Nível da garrafa"
              />
              <p className="muted">
                {s.garrafa.diasRestantes === null
                  ? "Sem agenda para estimar"
                  : `Dá para cerca de ${s.garrafa.diasRestantes} ${s.garrafa.diasRestantes === 1 ? "dia" : "dias"}`}
              </p>
            </>
          )}
        </Card>

        <Card title="Tigela">
          {s.tigela?.gramas === null || s.tigela?.gramas === undefined ? (
            <p className="muted">Sem leitura</p>
          ) : (
            <>
              <p className="big">{formatGrams(s.tigela.gramas)}</p>
              <p className="muted">
                {s.tigela.gramas > s.limites.limiteTigelaGramas
                  ? "Ainda tem ração"
                  : "Vazia"}
              </p>
            </>
          )}
        </Card>

        <Card title="Próxima refeição">
          {s.proximaRefeicao ? (
            <>
              <p className="big">{s.proximaRefeicao.hora}</p>
              <p className="muted">
                {s.proximaRefeicao.porcoes}{" "}
                {s.proximaRefeicao.porcoes === 1 ? "porção" : "porções"}
                {s.proximaRefeicao.amanha ? ", amanhã" : ""}
              </p>
            </>
          ) : (
            <p className="muted">Nenhuma refeição ativa na agenda</p>
          )}
        </Card>
      </div>

      <Card title="Última refeição">
        {s.ultimaRefeicao ? (
          <p>
            {formatTime(s.ultimaRefeicao.hora)}
            {s.ultimaRefeicao.porcoes !== null &&
              ` · ${s.ultimaRefeicao.porcoes} ${s.ultimaRefeicao.porcoes === 1 ? "porção" : "porções"}`}
            {s.ultimaRefeicao.gramas !== null &&
              ` · ${formatGrams(s.ultimaRefeicao.gramas)}`}
            {s.ultimaRefeicao.origem &&
              ` · ${originLabel(s.ultimaRefeicao.origem)}`}
          </p>
        ) : (
          <p className="muted">Nenhuma refeição registrada ainda</p>
        )}
      </Card>

      <p className="muted center small">
        {s.config.sincronizado
          ? "Configuração sincronizada com o alimentador"
          : "Configuração pendente: o alimentador aplica quando estiver online"}
      </p>
    </>
  );
}

export function ServeCard(props: {
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
          await api.feed(porcoes, forcar);
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
    <Card className="serve">
      <div className="serve-row">
        <Stepper
          value={porcoes}
          min={1}
          max={10}
          onChange={setPorcoes}
          label="Quantidade de porções"
          disabled={action.busy}
        />
        <span className="muted">{porcoes === 1 ? "porção" : "porções"}</span>
      </div>
      <button
        type="button"
        className="button button-primary button-big"
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
    </Card>
  );
}

function Alerts(props: { status: Status; onDone: () => Promise<void> }) {
  const action = useAction();
  const { alertas } = props.status;
  if (alertas.length === 0) return null;

  const acknowledge = async () => {
    await action.run(() => api.acknowledgeAlerts(), {
      ok: "Alertas fechados.",
      error: (err) => messageFor(err),
    });
    await props.onDone();
  };

  return (
    <section className="alerts" aria-label="Alertas">
      {alertas.map((alerta) => (
        <div className="alert" key={alerta.tipo} role="alert">
          <strong>{alertTitle(alerta.tipo)}</strong>
          <span>{alerta.mensagem}</span>
        </div>
      ))}
      {alertas.some((a) => needsAcknowledge(a.tipo)) && (
        <button
          type="button"
          className="button"
          disabled={action.busy}
          onClick={() => void acknowledge()}
        >
          Entendi
        </button>
      )}
      {action.feedback?.tone === "bad" && (
        <FeedbackLine feedback={action.feedback} />
      )}
    </section>
  );
}
