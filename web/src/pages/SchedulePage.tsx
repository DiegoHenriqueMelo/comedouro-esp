import { useEffect, useState } from "react";
import { ApiError, api, type ScheduleItem } from "../api";
import { useAction, useLoad } from "../hooks";
import { activePortions, messageFor } from "../messages";
import { Card, FeedbackLine, LoadError, Loading, Stepper } from "../ui";

const MAX_MEALS = 8;

// Um horário que ainda não está na agenda, para a refeição nova não nascer repetida.
export function freeTime(agenda: ScheduleItem[]): string {
  const used = new Set(agenda.map((m) => m.hora));
  for (const hour of [7, 12, 18, 21, 9, 15, 6, 23, 10, 14, 16, 20]) {
    const hora = `${String(hour).padStart(2, "0")}:00`;
    if (!used.has(hora)) return hora;
  }
  return "00:00";
}

export function SchedulePage() {
  const saved = useLoad(api.schedules);
  const config = useLoad(api.config);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const action = useAction();

  useEffect(() => {
    if (saved.data && !dirty) setItems(saved.data.agenda);
  }, [saved.data, dirty]);

  if (saved.loading) return <Loading />;
  if (!saved.data) {
    return (
      <LoadError
        message={messageFor(saved.error)}
        onRetry={() => void saved.reload()}
      />
    );
  }

  const change = (next: ScheduleItem[]) => {
    setItems(next);
    setDirty(true);
    action.setFeedback(null);
  };
  const update = (index: number, patch: Partial<ScheduleItem>) =>
    change(items.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  const save = async () => {
    const ok = await action.run(
      async () => {
        const result = await api.saveSchedules(items);
        setItems(result.agenda);
      },
      {
        ok: "Agenda salva.",
        // O servidor diz quais horários causaram o problema: mostra junto.
        error: (err) =>
          err instanceof ApiError && err.detalhe && err.status === 422
            ? `${messageFor(err)} (${err.detalhe})`
            : messageFor(err),
      },
    );
    if (ok) {
      setDirty(false);
      await saved.reload();
    }
  };

  const limit = config.data?.config.limiteDiarioPorcoes;
  const total = activePortions(items);

  return (
    <>
      <header className="page-header">
        <h1>Agenda</h1>
      </header>

      <p className="muted">
        As refeições se repetem todos os dias.
        {limit !== undefined &&
          ` As ativas somam ${total} de ${limit} porções do limite diário.`}
      </p>

      {items.length === 0 && (
        <Card>
          <p className="muted center">Nenhuma refeição agendada.</p>
        </Card>
      )}

      {items.map((meal, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a lista é editada no lugar e não é reordenada
        <Card key={index} className={meal.ativo ? "meal" : "meal meal-off"}>
          <div className="meal-row">
            <input
              type="time"
              className="input input-time"
              aria-label={`Horário da refeição ${index + 1}`}
              value={meal.hora}
              onChange={(e) => update(index, { hora: e.target.value })}
            />
            <Stepper
              value={meal.porcoes}
              min={1}
              max={10}
              onChange={(porcoes) => update(index, { porcoes })}
              label={`Porções da refeição ${index + 1}`}
            />
          </div>
          <div className="meal-row">
            <label className="switch">
              <input
                type="checkbox"
                checked={meal.ativo}
                onChange={(e) => update(index, { ativo: e.target.checked })}
              />
              <span>{meal.ativo ? "Ativa" : "Desativada"}</span>
            </label>
            <button
              type="button"
              className="button button-quiet"
              onClick={() => change(items.filter((_, i) => i !== index))}
            >
              Remover
            </button>
          </div>
        </Card>
      ))}

      <button
        type="button"
        className="button"
        disabled={items.length >= MAX_MEALS}
        onClick={() =>
          change([...items, { hora: freeTime(items), porcoes: 1, ativo: true }])
        }
      >
        {items.length >= MAX_MEALS
          ? "Máximo de 8 refeições"
          : "Adicionar refeição"}
      </button>

      <div className="save-bar">
        <FeedbackLine feedback={action.feedback} />
        <button
          type="button"
          className="button button-primary"
          disabled={!dirty || action.busy}
          onClick={() => void save()}
        >
          {action.busy ? "Salvando…" : "Salvar agenda"}
        </button>
      </div>
    </>
  );
}
