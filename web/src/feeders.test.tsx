import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, type FeederSummary, type User } from "./api";
import { FeedersPage, feederState } from "./pages/FeedersPage";
import { RemoveFeeder } from "./pages/SettingsPage";
import { feederPath, parseRoute } from "./router";

const ana: User = {
  id: "u1",
  nome: "Ana",
  email: "ana@example.com",
  foto: null,
};

const cozinha: FeederSummary = {
  id: "f1",
  apelido: "Cozinha",
  tipo: "simulado",
  criadoEm: "2026-11-16T12:00:00.000Z",
  online: true,
  alertas: 0,
};

beforeEach(() => window.history.replaceState(null, "", "/"));
afterEach(() => vi.restoreAllMocks());

describe("rotas", () => {
  it("lê a lista, o início e as abas de um comedouro", () => {
    expect(parseRoute("/")).toEqual({ name: "comedouros" });
    expect(parseRoute("/comedouros/f1")).toEqual({
      name: "comedouro",
      id: "f1",
      tab: "inicio",
    });
    expect(parseRoute("/comedouros/f1/agenda")).toEqual({
      name: "comedouro",
      id: "f1",
      tab: "agenda",
    });
  });

  it("uma aba desconhecida vira o início; um caminho desconhecido, a lista", () => {
    expect(parseRoute("/comedouros/f1/nada")).toMatchObject({ tab: "inicio" });
    expect(parseRoute("/qualquer")).toEqual({ name: "comedouros" });
  });

  it("monta o caminho de volta", () => {
    expect(feederPath("f1")).toBe("/comedouros/f1");
    expect(feederPath("f1", "historico")).toBe("/comedouros/f1/historico");
  });
});

describe("estado na lista", () => {
  it("offline é problema; aviso aberto é aviso; o resto, tudo certo", () => {
    expect(feederState({ ...cozinha, online: false, alertas: 2 })).toEqual({
      tone: "bad",
      text: "Offline",
    });
    expect(feederState({ ...cozinha, alertas: 1 })).toEqual({
      tone: "warn",
      text: "1 aviso",
    });
    expect(feederState({ ...cozinha, alertas: 3 }).text).toBe("3 avisos");
    expect(feederState(cozinha)).toEqual({ tone: "ok", text: "Tudo certo" });
  });
});

describe("FeedersPage", () => {
  it("lista os comedouros, e tocar num deles abre as telas dele", async () => {
    vi.spyOn(api, "feeders").mockResolvedValue({
      aparelhoDisponivel: false,
      comedouros: [cozinha],
    });
    render(<FeedersPage user={ana} />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Cozinha/ }),
    );

    expect(window.location.pathname).toBe("/comedouros/f1");
  });

  it("sem comedouros, já mostra o formulário; sem broker, 'aparelho' fica indisponível", async () => {
    vi.spyOn(api, "feeders").mockResolvedValue({
      aparelhoDisponivel: false,
      comedouros: [],
    });
    render(<FeedersPage user={ana} />);

    const aparelho = await screen.findByRole("radio", {
      name: /Tenho um aparelho/,
    });
    expect(aparelho).toBeDisabled();
    expect(
      screen.getByText("Este servidor ainda não tem broker MQTT."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /Experimentar sem aparelho/ }),
    ).toBeChecked();
  });

  it("criar um simulado leva direto para ele", async () => {
    vi.spyOn(api, "feeders").mockResolvedValue({
      aparelhoDisponivel: false,
      comedouros: [],
    });
    const create = vi
      .spyOn(api, "createFeeder")
      .mockResolvedValue({ comedouro: cozinha, credencial: null });
    render(<FeedersPage user={ana} />);

    await userEvent.type(await screen.findByLabelText(/Apelido/), "Cozinha");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(create).toHaveBeenCalledWith("Cozinha", "simulado");
    expect(window.location.pathname).toBe("/comedouros/f1");
  });

  it("criar um aparelho mostra o usuário e a senha, uma vez", async () => {
    vi.spyOn(api, "feeders").mockResolvedValue({
      aparelhoDisponivel: true,
      comedouros: [],
    });
    vi.spyOn(api, "createFeeder").mockResolvedValue({
      comedouro: { ...cozinha, apelido: "Sala", tipo: "aparelho" },
      credencial: { usuario: "f1", senha: "senha-secreta" },
    });
    render(<FeedersPage user={ana} />);

    await userEvent.type(await screen.findByLabelText(/Apelido/), "Sala");
    await userEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByText("Sala foi adicionado")).toBeInTheDocument();
    expect(screen.getByText("senha-secreta")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
  });

  it("apelido recusado: o erro aparece embaixo do campo", async () => {
    vi.spyOn(api, "feeders").mockResolvedValue({
      aparelhoDisponivel: false,
      comedouros: [],
    });
    vi.spyOn(api, "createFeeder").mockRejectedValue(
      new ApiError(422, "apelido_invalido"),
    );
    render(<FeedersPage user={ana} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Adicionar" }),
    );

    expect(
      await screen.findByText("O apelido precisa ter de 1 a 30 letras."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Apelido/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});

describe("remover comedouro", () => {
  it("pede confirmação, remove e volta para a lista", async () => {
    window.history.replaceState(null, "", "/comedouros/f1/ajustes");
    const remove = vi.spyOn(api, "removeFeeder").mockResolvedValue(null);
    render(<RemoveFeeder feederId="f1" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Remover este comedouro" }),
    );
    expect(remove).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Remover de vez" }),
    );

    expect(remove).toHaveBeenCalledWith("f1");
    expect(window.location.pathname).toBe("/");
  });

  it("cancelar não remove nada", async () => {
    const remove = vi.spyOn(api, "removeFeeder").mockResolvedValue(null);
    render(<RemoveFeeder feederId="f1" />);

    await userEvent.click(
      screen.getByRole("button", { name: "Remover este comedouro" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(remove).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Remover este comedouro" }),
    ).toBeInTheDocument();
  });
});
