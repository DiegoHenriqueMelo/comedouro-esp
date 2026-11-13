import { useEffect, useState } from "react";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { SchedulePage } from "./pages/SchedulePage";
import { SettingsPage } from "./pages/SettingsPage";

const TABS = [
  {
    id: "inicio",
    label: "Início",
    icon: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  },
  {
    id: "agenda",
    label: "Agenda",
    icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm1 4v5l3.5 2-1 1.7L11 13V7z",
  },
  {
    id: "historico",
    label: "Histórico",
    icon: "M5 5h14v2H5zm0 6h14v2H5zm0 6h9v2H5z",
  },
  {
    id: "ajustes",
    label: "Ajustes",
    icon: "M4 7h9v2H4zm13 0h3v2h-3zM4 15h3v2H4zm7 0h9v2h-9zm3-10h2v6h-2zM8 13h2v6H8z",
  },
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
      {!online && (
        <p className="offline-banner" role="alert">
          Sem conexão. Os dados podem estar desatualizados.
        </p>
      )}

      <main className="page">
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
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
