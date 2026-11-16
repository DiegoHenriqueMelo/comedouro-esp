import { useEffect, useState } from "react";
import type { User } from "./api";
import { messageFor } from "./messages";
import { FeedersPage } from "./pages/FeedersPage";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { PetPage } from "./pages/PetPage";
import { SchedulePage } from "./pages/SchedulePage";
import { SettingsPage } from "./pages/SettingsPage";
import { feederPath, navigate, type Route, TABS, useRoute } from "./router";
import { useSession } from "./session";
import { Icon, LoadError, Loading, Notice } from "./ui";

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
  const session = useSession();
  const { state } = session;

  if (state.status === "dentro") return <SignedInApp user={state.user} />;
  if (state.status === "fora") return <LoginPage onLogin={session.signedIn} />;
  return (
    <div className="app">
      <main className="page">
        {state.status === "carregando" ? (
          <Loading />
        ) : (
          <LoadError
            message={messageFor(state.error)}
            onRetry={session.retry}
          />
        )}
      </main>
    </div>
  );
}

function SignedInApp(props: { user: User }) {
  const route = useRoute();
  const online = useOnline();

  const offline = !online && (
    <Notice tone="bad" title="Sem conexão">
      Os dados podem estar desatualizados.
    </Notice>
  );

  if (route.name === "pet") {
    return (
      <div className="app">
        <main className="page page-no-tabs">
          <BackButton />
          {offline}
          <PetPage key={route.id ?? "novo"} id={route.id} />
        </main>
      </div>
    );
  }

  if (route.name === "comedouros") {
    return (
      <div className="app">
        <main className="page page-no-tabs">
          {offline}
          <FeedersPage user={props.user} />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <main className="page">
        <BackButton />
        {offline}
        <FeederScreen route={route} />
      </main>

      <nav className="tabs" aria-label="Seções">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === route.tab ? "tab tab-active" : "tab"}
            aria-current={t.id === route.tab ? "page" : undefined}
            onClick={() => navigate(feederPath(route.id, t.id))}
          >
            <Icon name={t.id} />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function BackButton() {
  return (
    <button type="button" className="back" onClick={() => navigate("/")}>
      <Icon name="voltar" />
      Comedouros
    </button>
  );
}

// `key` com o id: trocar de comedouro recomeça a tela, sem mostrar dados do anterior.
function FeederScreen(props: { route: Extract<Route, { name: "comedouro" }> }) {
  const { id, tab } = props.route;
  if (tab === "agenda") return <SchedulePage key={id} feederId={id} />;
  if (tab === "historico") return <HistoryPage key={id} feederId={id} />;
  if (tab === "ajustes") return <SettingsPage key={id} feederId={id} />;
  return <HomePage key={id} feederId={id} />;
}
