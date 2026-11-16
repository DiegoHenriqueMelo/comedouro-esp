import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { formatCode, PairingBlock, timeLeft } from "./pages/Pairing";
import { pairedWhen } from "./pages/SettingsPage";

const NOW = new Date("2026-11-16T12:00:00.000Z").getTime();
const inMinutes = (m: number) => new Date(NOW + m * 60_000).toISOString();

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("formato do código", () => {
  it("separa em dois grupos de 3", () => {
    expect(formatCode("482913")).toBe("482 913");
  });

  it("conta o tempo que falta, e diz quando venceu", () => {
    expect(timeLeft(inMinutes(10), NOW)).toBe("10:00");
    expect(timeLeft(inMinutes(0.5), NOW)).toBe("0:30");
    expect(timeLeft(inMinutes(0), NOW)).toBeNull();
  });
});

describe("quando foi pareado", () => {
  it("diz hoje, ontem, ou a data", () => {
    const now = new Date(2026, 10, 16, 15, 0);
    expect(pairedWhen(new Date(2026, 10, 16, 9, 0).toISOString(), now)).toBe(
      "hoje",
    );
    expect(pairedWhen(new Date(2026, 10, 15, 9, 0).toISOString(), now)).toBe(
      "ontem",
    );
    expect(pairedWhen(new Date(2026, 10, 10, 9, 0).toISOString(), now)).toMatch(
      /^em /,
    );
  });
});

describe("PairingBlock", () => {
  it("mostra o código que ainda vale, sem gerar outro", async () => {
    vi.spyOn(api, "pairingCode").mockResolvedValue({
      codigo: { codigo: "482913", expiraEm: inMinutes(60 * 24 * 365) },
    });
    const create = vi.spyOn(api, "newPairingCode");

    render(<PairingBlock feederId="f1" />);

    expect(await screen.findByText("482 913")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("sem código valendo, gera um", async () => {
    vi.spyOn(api, "pairingCode").mockResolvedValue({ codigo: null });
    vi.spyOn(api, "newPairingCode").mockResolvedValue({
      codigo: { codigo: "111222", expiraEm: inMinutes(60 * 24 * 365) },
    });

    render(<PairingBlock feederId="f1" />);

    expect(await screen.findByText("111 222")).toBeInTheDocument();
  });

  it("parear de novo (fresh) sempre gera um código novo", async () => {
    const current = vi.spyOn(api, "pairingCode");
    vi.spyOn(api, "newPairingCode").mockResolvedValue({
      codigo: { codigo: "333444", expiraEm: inMinutes(60 * 24 * 365) },
    });

    render(<PairingBlock feederId="f1" fresh />);

    expect(await screen.findByText("333 444")).toBeInTheDocument();
    expect(current).not.toHaveBeenCalled();
  });

  it("quando vence, avisa, e 'Gerar outro código' troca o código", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
    vi.spyOn(api, "pairingCode").mockResolvedValue({
      codigo: { codigo: "482913", expiraEm: inMinutes(1) },
    });
    vi.spyOn(api, "newPairingCode").mockResolvedValue({
      codigo: { codigo: "555666", expiraEm: inMinutes(11) },
    });
    render(<PairingBlock feederId="f1" />);
    expect(await screen.findByText("Vale por 1:00.")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(61_000));
    expect(screen.getByText("Este código venceu.")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Gerar outro código" }),
    );
    expect(await screen.findByText("555 666")).toBeInTheDocument();
  });
});
