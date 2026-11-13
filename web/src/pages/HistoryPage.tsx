import { useState } from "react";
import { api, type HistoryItem } from "../api";
import { useLoad } from "../hooks";
import { formatDay, formatTime, historyLine, messageFor } from "../messages";
import { Card, LoadError, Loading } from "../ui";

// Junta os itens por dia, mantendo a ordem (do mais recente para o mais antigo).
export function groupByDay(
  items: HistoryItem[],
  now: Date = new Date(),
): { day: string; items: HistoryItem[] }[] {
  const groups: { day: string; items: HistoryItem[] }[] = [];
  for (const item of items) {
    const day = formatDay(item.hora, now);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

export function HistoryPage() {
  const [limit, setLimit] = useState(50);
  const history = useLoad(() => api.history(limit), 10_000);

  if (history.loading) return <Loading />;
  if (!history.data) {
    return (
      <LoadError
        message={messageFor(history.error)}
        onRetry={() => void history.reload()}
      />
    );
  }

  const groups = groupByDay(history.data);
  return (
    <>
      <header className="page-header">
        <h1>Histórico</h1>
      </header>

      {groups.length === 0 && (
        <Card>
          <p className="muted center">Nada registrado ainda.</p>
        </Card>
      )}

      {groups.map((group) => (
        <Card key={group.day} title={group.day}>
          <ul className="history">
            {group.items.map((item) => {
              const line = historyLine(item);
              return (
                <li key={item.seq} className="history-item">
                  <span className={`dot dot-${line.tone}`} aria-hidden="true" />
                  <span className="history-text">
                    <strong>{line.title}</strong>
                    {line.detail && (
                      <span className="muted">{line.detail}</span>
                    )}
                  </span>
                  <time className="muted" dateTime={item.hora}>
                    {formatTime(item.hora)}
                  </time>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      {limit < 200 && history.data.length >= limit && (
        <button
          type="button"
          className="button"
          onClick={() => {
            setLimit(200);
            setTimeout(() => void history.reload(), 0);
          }}
        >
          Ver mais
        </button>
      )}
    </>
  );
}
