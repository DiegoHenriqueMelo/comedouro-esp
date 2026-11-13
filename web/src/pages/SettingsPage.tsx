import { useEffect, useState } from "react";
import { api, type Config } from "../api";
import { useAction, useLoad } from "../hooks";
import { messageFor } from "../messages";
import { disablePush, enablePush, getPushState, type PushState } from "../push";
import {
  Card,
  FeedbackLine,
  Field,
  LoadError,
  Loading,
  parseNumber,
} from "../ui";

type NumericKey = Exclude<keyof Config, "fusoHorario">;

const FIELDS: { key: NumericKey; label: string; hint: string }[] = [
  {
    key: "gramasPorPorcao",
    label: "Gramas por porção",
    hint: "O peso de uma porção. Vem da calibração da dose, mais abaixo.",
  },
  {
    key: "limiteDiarioPorcoes",
    label: "Limite diário (porções)",
    hint: "O máximo que o alimentador serve num dia, somando agenda, app e Alexa.",
  },
  {
    key: "intervaloMinimoMin",
    label: "Intervalo mínimo (minutos)",
    hint: "O tempo mínimo entre duas refeições.",
  },
  {
    key: "limiteTigelaGramas",
    label: "Limite da tigela (gramas)",
    hint: "Com mais que isso na tigela, o alimentador não serve.",
  },
  {
    key: "alturaGarrafaMm",
    label: "Altura da garrafa (mm)",
    hint: "Da tampa até o fundo, para calcular o nível.",
  },
  {
    key: "anguloEncher",
    label: "Ângulo de encher (graus)",
    hint: "A posição do servo com o bolso embaixo da garrafa.",
  },
  {
    key: "anguloServir",
    label: "Ângulo de servir (graus)",
    hint: "A posição do servo com o bolso em cima do furo de saída.",
  },
];

type Form = Record<NumericKey, string> & { fusoHorario: string };

function toForm(config: Config): Form {
  const form = { fusoHorario: config.fusoHorario } as Form;
  for (const { key } of FIELDS) {
    form[key] = String(config[key]).replace(".", ",");
  }
  return form;
}

// Devolve null quando algum campo não é número.
export function fromForm(form: Form): Config | null {
  const config = { fusoHorario: form.fusoHorario } as Config;
  for (const { key } of FIELDS) {
    const value = parseNumber(form[key]);
    if (Number.isNaN(value)) return null;
    config[key] = value;
  }
  return config;
}

export function SettingsPage() {
  const saved = useLoad(api.config);
  const status = useLoad(api.status, 5000);
  const [form, setForm] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);
  const action = useAction();

  useEffect(() => {
    if (saved.data && !dirty) setForm(toForm(saved.data.config));
  }, [saved.data, dirty]);

  if (saved.loading) return <Loading />;
  if (!saved.data || !form) {
    return (
      <LoadError
        message={messageFor(saved.error)}
        onRetry={() => void saved.reload()}
      />
    );
  }

  const set = (key: keyof Form, value: string) => {
    setForm({ ...form, [key]: value });
    setDirty(true);
    action.setFeedback(null);
  };

  const save = async () => {
    const config = fromForm(form);
    if (!config) {
      action.setFeedback({
        tone: "bad",
        text: "Há um campo que não é número. Confira os valores.",
      });
      return;
    }
    const ok = await action.run(() => api.saveConfig(config), {
      ok: "Ajustes salvos.",
      error: (err) => messageFor(err),
    });
    if (ok) {
      setDirty(false);
      await saved.reload();
    }
  };

  return (
    <>
      <header className="page-header">
        <h1>Ajustes</h1>
      </header>

      <Card title="Alimentação">
        {FIELDS.slice(0, 4).map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <input
              className="input"
              inputMode="decimal"
              value={form[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </Field>
        ))}
        <Field label="Fuso horário" hint="O horário da agenda segue este fuso.">
          <select
            className="input"
            value={form.fusoHorario}
            onChange={(e) => set("fusoHorario", e.target.value)}
          >
            {saved.data.fusos.map((fuso) => (
              <option key={fuso} value={fuso}>
                {fuso.replace("America/", "").replace("_", " ")}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      <Card title="Mecânica">
        {FIELDS.slice(4).map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <input
              className="input"
              inputMode="decimal"
              value={form[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </Field>
        ))}
      </Card>

      <div className="save-bar">
        <FeedbackLine feedback={action.feedback} />
        <button
          type="button"
          className="button button-primary"
          disabled={!dirty || action.busy}
          onClick={() => void save()}
        >
          {action.busy ? "Salvando…" : "Salvar ajustes"}
        </button>
      </div>

      <Maintenance form={form} />
      <Notifications />
      {status.data?.simulado && <Simulator onDone={status.reload} />}

      <p className="muted center small">
        Configuração na versão {saved.data.versao}
        {status.data &&
          (status.data.config.sincronizado
            ? ", sincronizada com o alimentador."
            : ", ainda não aplicada pelo alimentador.")}
      </p>
    </>
  );
}

// Comandos que mexem no aparelho: só funcionam com ele online e parado.
function Maintenance(props: { form: Form }) {
  const action = useAction();
  const [peso, setPeso] = useState("500");
  const [porcoes, setPorcoes] = useState("20");

  const run = (send: () => Promise<unknown>, ok: string) =>
    void action.run(send, { ok, error: (err) => messageFor(err) });

  const number = (text: string, send: (value: number) => Promise<unknown>) => {
    const value = parseNumber(text);
    if (Number.isNaN(value)) {
      action.setFeedback({ tone: "bad", text: "Digite um número." });
      return;
    }
    run(() => send(value), "Comando enviado.");
  };

  return (
    <Card title="Manutenção">
      <div className="maintenance">
        <p className="muted">
          <strong>Balança.</strong> Tare com a tigela vazia e limpa. Para
          calibrar, coloque um peso conhecido no prato.
        </p>
        <button
          type="button"
          className="button"
          disabled={action.busy}
          onClick={() => run(api.tare, "Balança zerada.")}
        >
          Tarar a balança
        </button>
        <div className="inline">
          <input
            className="input"
            inputMode="decimal"
            aria-label="Peso conhecido, em gramas"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
          />
          <button
            type="button"
            className="button"
            disabled={action.busy}
            onClick={() => number(peso, api.calibrateScale)}
          >
            Calibrar com esse peso (g)
          </button>
        </div>

        <p className="muted">
          <strong>Dose.</strong> Solte várias porções numa balança de cozinha e
          divida o peso pelo número de porções: o resultado é o “gramas por
          porção”. Essas porções não contam no limite diário.
        </p>
        <div className="inline">
          <input
            className="input"
            inputMode="numeric"
            aria-label="Quantidade de porções para pesar"
            value={porcoes}
            onChange={(e) => setPorcoes(e.target.value)}
          />
          <button
            type="button"
            className="button"
            disabled={action.busy}
            onClick={() => number(porcoes, api.calibrateDose)}
          >
            Soltar porções para pesar
          </button>
        </div>

        <p className="muted">
          <strong>Servo.</strong> Move o servo até o ângulo digitado nos campos
          acima, para achar as posições certas antes de salvar.
        </p>
        <div className="inline">
          <button
            type="button"
            className="button"
            disabled={action.busy}
            onClick={() => number(props.form.anguloEncher, api.testServo)}
          >
            Testar ângulo de encher
          </button>
          <button
            type="button"
            className="button"
            disabled={action.busy}
            onClick={() => number(props.form.anguloServir, api.testServo)}
          >
            Testar ângulo de servir
          </button>
        </div>
        <FeedbackLine feedback={action.feedback} />
      </div>
    </Card>
  );
}

const PUSH_TEXT: Record<PushState, string> = {
  sem_suporte:
    "Este navegador não recebe notificações. No iPhone, instale o app na tela inicial antes. O endereço também precisa ser HTTPS.",
  servidor_desligado:
    "O servidor está sem as chaves de notificação (VAPID). Veja o guia de configuração.",
  bloqueado:
    "As notificações estão bloqueadas para este site. Libere nas configurações do navegador.",
  desativado: "As notificações estão desativadas neste aparelho.",
  ativado: "Este aparelho recebe os avisos do alimentador.",
};

function Notifications() {
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
      <p className="muted">{state ? PUSH_TEXT[state] : "Verificando…"}</p>
      <div className="inline">
        {state === "desativado" && (
          <button
            type="button"
            className="button button-primary"
            disabled={action.busy}
            onClick={() => change(enablePush, "Pronto.")}
          >
            Ativar neste aparelho
          </button>
        )}
        {state === "ativado" && (
          <>
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
          </>
        )}
      </div>
      <FeedbackLine feedback={action.feedback} />
    </Card>
  );
}

// Só aparece quando o servidor roda sem ESP32: mexe no "mundo físico" de mentira.
function Simulator(props: { onDone: () => Promise<void> }) {
  const action = useAction();
  const [tigela, setTigela] = useState("30");
  const [garrafa, setGarrafa] = useState("100");

  const send = (changes: Parameters<typeof api.simulate>[0]) =>
    void action
      .run(() => api.simulate(changes), {
        ok: "Simulação atualizada.",
        error: (err) => messageFor(err),
      })
      .then(props.onDone);

  const grams = (text: string, key: "tigelaGramas" | "garrafaGramas") => {
    const value = parseNumber(text);
    if (Number.isNaN(value)) {
      action.setFeedback({ tone: "bad", text: "Digite um número." });
      return;
    }
    send({ [key]: value });
  };

  return (
    <Card title="Simulador">
      <p className="muted">
        O servidor está rodando sem ESP32. Use isto para ver as recusas e os
        avisos acontecerem.
      </p>
      <div className="inline">
        <input
          className="input"
          inputMode="decimal"
          aria-label="Gramas na tigela"
          value={tigela}
          onChange={(e) => setTigela(e.target.value)}
        />
        <button
          type="button"
          className="button"
          disabled={action.busy}
          onClick={() => grams(tigela, "tigelaGramas")}
        >
          Pôr ração na tigela (g)
        </button>
      </div>
      <div className="inline">
        <input
          className="input"
          inputMode="decimal"
          aria-label="Gramas na garrafa"
          value={garrafa}
          onChange={(e) => setGarrafa(e.target.value)}
        />
        <button
          type="button"
          className="button"
          disabled={action.busy}
          onClick={() => grams(garrafa, "garrafaGramas")}
        >
          Deixar na garrafa (g)
        </button>
      </div>
      <div className="inline">
        <button
          type="button"
          className="button"
          disabled={action.busy}
          onClick={() => send({ balanca: false })}
        >
          Desligar a balança
        </button>
        <button
          type="button"
          className="button"
          disabled={action.busy}
          onClick={() => send({ balanca: true, nivel: true })}
        >
          Religar os sensores
        </button>
      </div>
      <FeedbackLine feedback={action.feedback} />
    </Card>
  );
}
