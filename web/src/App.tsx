import { useEffect, useState } from "react";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { SchedulePage } from "./pages/SchedulePage";
import { SettingsPage } from "./pages/SettingsPage";
import { Icon, Notice } from "./ui";

const TABS = [
  { id: "inicio", label: "Início" },
  { id: "agenda", label: "Agenda" },
  { id: "historico", label: "Histórico" },
  { id: "ajustes", label: "Ajustes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabFromHash(): TabId {
  const id = window.location.hash.replace("#", "");
  return TABS.some((t) => t.id === id) ? (id as TabId) : "inicio";
}

// Avisa quando o próprio aparelho fica sem rede: o app continua abrindo, mas não dá para comandar nada.
function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}

export function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const online = useOnline();

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (id: TabId) => {
    window.location.hash = id;
    setTab(id);
    window.scrollTo(0, 0);
  };

  return (
    <div className="app">
      <main className="page">
        {!online && (
          <Notice tone="bad" title="Sem conexão">
            Os dados podem estar desatualizados.
          </Notice>
        )}
        {tab === "inicio" && <HomePage />}
        {tab === "agenda" && <SchedulePage />}
        {tab === "historico" && <HistoryPage />}
        {tab === "ajustes" && <SettingsPage />}
      </main>

      <nav className="tabs" aria-label="Seções">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === tab ? "tab tab-active" : "tab"}
            aria-current={t.id === tab ? "page" : undefined}
            onClick={() => go(t.id)}
          >
            <Icon name={t.id} />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
