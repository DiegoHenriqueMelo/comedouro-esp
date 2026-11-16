import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ApiError, api, SESSION_ENDED, type User } from "./api";
import { Account } from "./pages/AccountCards";
import { LoginCard } from "./pages/LoginPage";

const ana: User = {
  id: "u1",
  nome: "Ana",
  email: "ana@example.com",
  foto: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("sessão no app", () => {
  it("sem sessão, abre a tela de login", async () => {
    vi.spyOn(api, "me").mockRejectedValue(new ApiError(401, "nao_autenticado"));
    vi.spyOn(api, "loginOptions").mockResolvedValue({
      google: null,
      dev: true,
    });

    render(<App />);

    expect(
      await screen.findByRole("button", { name: "Entrar como dev" }),
    ).toBeInTheDocument();
  });

  it("sem conexão, não manda para o login: mostra o erro e 'Tentar de novo'", async () => {
    vi.spyOn(api, "me").mockRejectedValue(new ApiError(0, "sem_conexao"));

    render(<App />);

    expect(
      await screen.findByText("Sem conexão com o servidor."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tentar de novo" }),
    ).toBeInTheDocument();
  });

  it("entrar como dev leva para dentro do app", async () => {
    vi.spyOn(api, "me").mockRejectedValue(new ApiError(401, "nao_autenticado"));
    vi.spyOn(api, "loginOptions").mockResolvedValue({
      google: null,
      dev: true,
    });
    vi.spyOn(api, "loginDev").mockResolvedValue({ usuario: ana });
    vi.spyOn(api, "feeders").mockResolvedValue({
      aparelhoDisponivel: false,
      comedouros: [],
    });

    render(<App />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Entrar como dev" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Comedouros" }),
    ).toBeInTheDocument();
  });

  it("quando a sessão acaba no meio do uso, volta para o login", async () => {
    vi.spyOn(api, "me").mockResolvedValue(ana);
    vi.spyOn(api, "feeders").mockResolvedValue({
      aparelhoDisponivel: false,
      comedouros: [],
    });
    vi.spyOn(api, "loginOptions").mockResolvedValue({
      google: null,
      dev: true,
    });

    render(<App />);
    await screen.findByRole("heading", { name: "Comedouros" });

    window.dispatchEvent(new Event(SESSION_ENDED));

    expect(
      await screen.findByRole("button", { name: "Entrar como dev" }),
    ).toBeInTheDocument();
  });

  it("um 401 da API avisa o app; um 401 do próprio login, não", async () => {
    const listener = vi.fn();
    window.addEventListener(SESSION_ENDED, listener);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ motivo: "nao_autenticado" }), {
          status: 401,
        }),
      ),
    );

    await expect(api.loginGoogle("x")).rejects.toThrow();
    expect(listener).not.toHaveBeenCalled();

    await expect(api.status("f1")).rejects.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(SESSION_ENDED, listener);
  });
});

describe("LoginCard", () => {
  it("sem Google e sem dev, explica o que configurar", () => {
    render(
      <LoginCard
        options={{ google: null, dev: false }}
        busy={false}
        onGoogle={vi.fn()}
        onDev={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Nenhuma forma de entrar configurada"),
    ).toBeInTheDocument();
  });

  it("sem dev, o botão 'Entrar como dev' não aparece", () => {
    vi.stubGlobal("google", undefined);
    render(
      <LoginCard
        options={{ google: null, dev: false }}
        busy={false}
        onGoogle={vi.fn()}
        onDev={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Entrar como dev" }),
    ).not.toBeInTheDocument();
  });
});

describe("Sua conta", () => {
  it("mostra nome e e-mail, e 'Sair' encerra a sessão", async () => {
    const logout = vi.spyOn(api, "logout").mockResolvedValue(null);
    const listener = vi.fn();
    window.addEventListener(SESSION_ENDED, listener);

    render(<Account user={ana} />);
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sair" }));

    expect(logout).toHaveBeenCalled();
    expect(listener).toHaveBeenCalled();
    window.removeEventListener(SESSION_ENDED, listener);
  });
});
