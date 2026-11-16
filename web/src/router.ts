import { useEffect, useState } from "react";

// As rotas do app, com URL de verdade: dá para voltar pelo botão do celular e abrir um link direto.
//   /                                → a lista de comedouros
//   /comedouros/<id>                 → o início daquele comedouro
//   /comedouros/<id>/<aba>           → agenda, histórico ou ajustes

export const TABS = [
  { id: "inicio", label: "Início" },
  { id: "agenda", label: "Agenda" },
  { id: "historico", label: "Histórico" },
  { id: "ajustes", label: "Ajustes" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export type Route =
  | { name: "comedouros" }
  | { name: "comedouro"; id: string; tab: TabId };

const NAVIGATED = "comedouro:navegou";

export function parseRoute(pathname: string): Route {
  const [first, id, tab] = pathname.split("/").filter(Boolean);
  if (first === "comedouros" && id) {
    const valid = TABS.find((t) => t.id === tab)?.id ?? "inicio";
    return { name: "comedouro", id: decodeURIComponent(id), tab: valid };
  }
  return { name: "comedouros" };
}

export function feederPath(id: string, tab: TabId = "inicio"): string {
  const base = `/comedouros/${encodeURIComponent(id)}`;
  return tab === "inicio" ? base : `${base}/${tab}`;
}

export function navigate(path: string): void {
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new Event(NAVIGATED));
  window.scrollTo(0, 0);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() =>
    parseRoute(window.location.pathname),
  );

  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", update);
    window.addEventListener(NAVIGATED, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(NAVIGATED, update);
    };
  }, []);

  return route;
}
