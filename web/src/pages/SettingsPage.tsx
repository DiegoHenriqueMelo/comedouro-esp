import { useEffect, useState } from "react";
import { api, type Config } from "../api";
import { useAction, useLoad } from "../hooks";
import { fieldFor, messageFor } from "../messages";
import { disablePush, enablePush, getPushState, type PushState } from "../push";
import {
  Card,
  FeedbackLine,
  Field,
  LoadError,
  Loading,
  parseNumber,
} from "../ui";

type NumericKey = Exclude<keyof Config, "fusoHorario" | "nomeDoGato">;

const FIELDS: { key: NumericKey; label: string; hint: string }[] = [
  {
    key: "gramasPorPorcao",
    label: "Gramas por porção",
    hint: "O peso de uma porção. Vem da calibração da dose, mais abaixo.",
  },
  {
    key: "limiteDiarioPorcoes",
    label: "Limite diário, em porções",
    hint: "O máximo que o comedouro serve num dia, somando agenda, app e Alexa.",
  },
  {
    key: "intervaloMinimoMin",
    label: "Intervalo mínimo, em minutos",
    hint: "O tempo mínimo entre duas refeições.",
  },
  {
    key: "limiteTigelaGramas",
    label: "Limite da tigela, em gramas",
    hint: "Com mais que isso na tigela, o comedouro não serve.",
  },
  {
    key: "alturaGarrafaMm",
    label: "Altura da garrafa, em milímetros",
    hint: "Da tampa até o fundo, para calcular o nível.",
  },
  {
    key: "anguloEncher",
    label: "Ângulo de encher, em graus",
    hint: "A posição do servo com o bolso embaixo da garrafa.",
  },
  {
    key: "anguloServir",
    label: "Ângulo de servir, em graus",
    hint: "A posição do servo com o bolso em cima do furo de saída.",
  },
];

type Form = Record<NumericKey, string> & {
  fusoHorario: string;
  nomeDoGato: string;
};

function toForm(config: Config): Form {
  const form = {
    fusoHorario: config.fusoHorario,
    nomeDoGato: config.nomeDoGato,
  } as Form;
  for (const { key } of FIELDS) {
    form[key] = String(config[key]).replace(".", ",");
  }
  return form;
}

// Devolve o nome do primeiro campo que não é número, ou a configuração pronta.
export function fromForm(form: Form): Config | { invalid: NumericKey } {
  const config = {
    fusoHorario: form.fusoHorario,
    nomeDoGato: form.nomeDoGato.trim(),
  } as Config;
  for (const { key } of FIELDS) {
    const value = parseNumber(form[key]);
    if (Number.isNaN(value)) return { invalid: key };
    config[key] = value;
  }
  return config;
}

export function SettingsPage() {
  const saved = useLoad(api.config);
  const status = useLoad(api.status, 5000);
  const [form, setForm] = useState<Form | null>(null);
  const [dirty, setDirty] = useState(false);
  // O erro fica embaixo do campo que o causou (guia de UI/UX, seção 5.7).
  const [fieldError, setFieldError] = useState<{
    key: string;
    text: string;
  } | null>(null);
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
    setFieldError(null);
    action.setFeedback(null);
  };
  const errorOf = (key: string) =>
    fieldError?.key === key ? fieldError.text : null;

  const save = async () => {
    setFieldError(null);
    const config = fromForm(form);
    if ("invalid" in config) {
      setFieldError({ key: config.invalid, text: "Digite um número." });
      return;
    }

    let failure: unknown = null;
    const ok = await action.run(
      async () => {
        try {
          await api.saveConfig(config);
        } catch (err) {
          failure = err;
          throw err;
        }
      },
      { ok: "Ajustes salvos.", error: (err) => messageFor(err) },
    );

    if (ok) {
      setDirty(false);
      await saved.reload();
      return;
    }
    const key = fieldFor(failure);
    if (key) {
      // O erro tem dono: sai do rodapé e vai para o campo.
      setFieldError({ key, text: messageFor(failure) });
      action.setFeedback(null);
    }
  };

  const numberField = (f: (typeof FIELDS)[number]) => (
    <Field key={f.key} label={f.label} hint={f.hint} error={errorOf(f.key)}>
      <input
        className="input"
        inputMode="decimal"
        aria-invalid={errorOf(f.key) !== null}
        value={form[f.key]}
        onChange={(e) => set(f.key, e.target.value)}
      />
    </Field>
  );

  return (
    <>
      <header className="page-header">
        <h1>Ajustes</h1>
      </header>

      <Card title="Seu gato">
        <Field
          label="Nome"
          hint="O app usa o nome nas frases: “Mingau comeu às 12:30.”"
          error={errorOf("nomeDoGato")}
        >
          <input
            className="input"
            autoComplete="off"
            maxLength={30}
            aria-invalid={errorOf("nomeDoGato") !== null}
            value={form.nomeDoGato}
            onChange={(e) => set("nomeDoGato", e.target.value)}
          />
        </Field>
      </Card>

      <Card title="Alimentação">
        {FIELDS.slice(0, 4).map(numberField)}
        <Field
          label="Fuso horário"
          hint="O horário da agenda segue este fuso."
          error={errorOf("fusoHorario")}
        >
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

      <Card title="Mecânica">{FIELDS.slice(4).map(numberField)}</Card>

      <FeedbackLine feedback={action.feedback} />
      <button
        type="button"
        className="button button-primary"
        disabled={!dirty || action.busy}
        onClick={() => void save()}
      >
        {action.busy ? "Salvando…" : "Salvar ajustes"}
      </button>

      <Maintenance form={form} />
      <Notifications />
      {status.data?.simulado && <Simulator onDone={status.reload} />}

      <p className="legend center">
        Configuração na versão {saved.data.versao}
        {status.data &&
          (status.data.config.sincronizado
            ? ", sincronizada com o comedouro."
            : ", ainda não aplicada pelo comedouro.")}
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
      action.setFeedback({ tone: "warn", text: "Digite um número." });
      return;
    }
    run(() => send(value), "Comando enviado.");
  };

  return (
    <Card title="Manutenção">
      <div className="section stack">
        <p className="legend">
          Balança: tare com a tigela vazia e limpa. Para calibrar, coloque um
          peso conhecido no prato.
        </p>
        <button
          type="button"
          className="button"
          disabled={action.busy}
          onClick={() => run(api.tare, "Balança zerada.")}
        >
          Tarar a balança
        </button>
        <Field label="Peso conhecido, em gramas">
          <input
            className="input"
            inputMode="decimal"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
          />
        </Field>
        <button
          type="button"
          className="button"
          disabled={action.busy}
          onClick={() => number(peso, api.calibrateScale)}
        >
          Calibrar a balança
        </button>
      </div>

      <div className="section stack">
        <p className="legend">
          Dose: solte várias porções numa balança de cozinha e divida o peso
          pelo número de porções. O resultado é o “gramas por porção”. Essas
          porções não contam no limite diário.
        </p>
        <Field label="Quantidade de porções">
          <input
            className="input"
            inputMode="numeric"
            value={porcoes}
            onChange={(e) => setPorcoes(e.target.value)}
          />
        </Field>
        <button
          type="button"
          className="button"
          disabled={action.busy}
          onClick={() => number(porcoes, api.calibrateDose)}
        >
          Soltar porções para pesar
        </button>
      </div>

      <div className="section stack">
        <p className="legend">
          Servo: move o servo até o ângulo digitado nos campos acima, para achar
          as posições certas antes de salvar.
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
      </div>
      <FeedbackLine feedback={action.feedback} />
    </Card>
  );
}

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
      action.setFeedback({ tone: "warn", text: "Digite um número." });
      return;
    }
    send({ [key]: value });
  };

  return (
    <Card title="Simulador">
      <p className="legend">
        O servidor está rodando sem a placa. Use isto para ver as recusas e os
        avisos acontecerem.
      </p>
      <div className="section stack">
        <Field label="Ração na tigela, em gramas">
          <input
            className="input"
            inputMode="decimal"
            value={tigela}
            onChange={(e) => setTigela(e.target.value)}
          />
        </Field>
        <button
          type="button"
          className="button"
          disabled={action.busy}
          onClick={() => grams(tigela, "tigelaGramas")}
        >
          Aplicar na tigela
        </button>
      </div>
      <div className="section stack">
        <Field label="Ração na garrafa, em gramas">
          <input
            className="input"
            inputMode="decimal"
            value={garrafa}
            onChange={(e) => setGarrafa(e.target.value)}
          />
        </Field>
        <button
          type="button"
          className="button"
          disabled={action.busy}
          onClick={() => grams(garrafa, "garrafaGramas")}
        >
          Aplicar na garrafa
        </button>
      </div>
      <div className="section inline">
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
