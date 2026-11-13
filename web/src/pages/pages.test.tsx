import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, type HistoryItem, type Status } from "../api";
import { groupByDay } from "./HistoryPage";
import { ServeCard } from "./HomePage";
import { freeTime, SchedulePage } from "./SchedulePage";
import { fromForm } from "./SettingsPage";

const status = (changes: Partial<Status> = {}): Status =>
  ({
    estado: "ocioso",
    tigela: { gramas: 12, estavel: true },
    ...changes,
  }) as Status;

afterEach(() => vi.restoreAllMocks());

describe("ServeCard", () => {
  it("serve a quantidade escolhida e confirma", async () => {
    const feed = vi.spyOn(api, "feed").mockResolvedValue({});
    const onDone = vi.fn().mockResolvedValue(undefined);
    render(<ServeCard status={status()} onDone={onDone} />);

    await userEvent.click(screen.getByRole("button", { name: "Aumentar" }));
    await userEvent.click(screen.getByRole("button", { name: "Servir agora" }));

    expect(feed).toHaveBeenCalledWith(2, false);
    expect(await screen.findByText("Porções a caminho.")).toBeInTheDocument();
    expect(onDone).toHaveBeenCalled();
  });

  it("com a tigela cheia, mostra os gramas e oferece 'servir mesmo assim', que manda forcar", async () => {
    const feed = vi
      .spyOn(api, "feed")
      .mockRejectedValueOnce(new ApiError(429, "tigela_com_racao"))
      .mockResolvedValueOnce({});
    render(
      <ServeCard status={status()} onDone={vi.fn().mockResolvedValue(null)} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Servir agora" }));
    expect(
      await screen.findByText("A tigela ainda tem 12 g."),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Servir mesmo assim" }),
    );

    expect(feed).toHaveBeenLastCalledWith(1, true);
    expect(await screen.findByText("Porção a caminho.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Servir mesmo assim" }),
    ).not.toBeInTheDocument();
  });

  it("no limite diário, mostra a mensagem e não oferece forçar", async () => {
    vi.spyOn(api, "feed").mockRejectedValue(new ApiError(429, "limite_diario"));
    render(
      <ServeCard status={status()} onDone={vi.fn().mockResolvedValue(null)} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Servir agora" }));

    expect(
      await screen.findByText("Limite de hoje atingido."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Servir mesmo assim" }),
    ).not.toBeInTheDocument();
  });

  it("enquanto o alimentador serve, o botão fica desabilitado", () => {
    render(
      <ServeCard
        status={status({ estado: "servindo" })}
        onDone={vi.fn().mockResolvedValue(null)}
      />,
    );

    expect(screen.getByRole("button", { name: "Servindo…" })).toBeDisabled();
  });
});

describe("SchedulePage", () => {
  const cafe = { hora: "07:30", porcoes: 2, ativo: true };

  function mockApi() {
    vi.spyOn(api, "schedules").mockResolvedValue({ versao: 2, agenda: [cafe] });
    vi.spyOn(api, "config").mockResolvedValue({
      versao: 2,
      config: { limiteDiarioPorcoes: 10 } as never,
      fusos: [],
    });
  }

  it("mostra a agenda salva e a soma das porções contra o limite", async () => {
    mockApi();
    render(<SchedulePage />);

    expect(await screen.findByLabelText("Horário da refeição 1")).toHaveValue(
      "07:30",
    );
    expect(
      await screen.findByText(/As ativas somam 2 de 10 porções/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Salvar agenda" }),
    ).toBeDisabled();
  });

  it("um erro de regra aparece com os horários que o servidor apontou", async () => {
    mockApi();
    const save = vi
      .spyOn(api, "saveSchedules")
      .mockRejectedValue(
        new ApiError(
          422,
          "horarios_muito_proximos",
          "07:00 e 07:30 estão a 30 min, menos que o intervalo mínimo de 60 min",
        ),
      );
    render(<SchedulePage />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Adicionar refeição" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Salvar agenda" }),
    );

    expect(save).toHaveBeenCalledWith([
      cafe,
      { hora: "07:00", porcoes: 1, ativo: true },
    ]);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Há duas refeições ativas mais próximas que o intervalo mínimo.",
    );
    expect(alert).toHaveTextContent("07:00 e 07:30 estão a 30 min");
    // A edição não se perde: dá para corrigir e salvar de novo.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Salvar agenda" }),
      ).toBeEnabled(),
    );
  });
});

describe("funções de apoio das telas", () => {
  it("freeTime escolhe um horário que ainda não está na agenda", () => {
    expect(freeTime([])).toBe("07:00");
    expect(freeTime([{ hora: "07:00", porcoes: 1, ativo: true }])).toBe(
      "12:00",
    );
  });

  it("groupByDay junta os itens do mesmo dia, mantendo a ordem", () => {
    const item = (seq: number, date: Date) =>
      ({ seq, hora: date.toISOString() }) as HistoryItem;
    const now = new Date(2026, 10, 10, 20, 0);

    const groups = groupByDay(
      [
        item(3, new Date(2026, 10, 10, 18, 0)),
        item(2, new Date(2026, 10, 10, 7, 30)),
        item(1, new Date(2026, 10, 9, 18, 0)),
      ],
      now,
    );

    expect(groups.map((g) => [g.day, g.items.map((i) => i.seq)])).toEqual([
      ["Hoje", [3, 2]],
      ["Ontem", [1]],
    ]);
  });

  it("fromForm aceita vírgula e devolve null quando um campo não é número", () => {
    const form = {
      gramasPorPorcao: "6,5",
      limiteDiarioPorcoes: "10",
      intervaloMinimoMin: "30",
      limiteTigelaGramas: "10",
      alturaGarrafaMm: "230",
      anguloEncher: "0",
      anguloServir: "60",
      fusoHorario: "America/Sao_Paulo",
    };

    expect(fromForm(form)?.gramasPorPorcao).toBe(6.5);
    expect(fromForm({ ...form, anguloServir: "abc" })).toBeNull();
    expect(fromForm({ ...form, limiteDiarioPorcoes: "" })).toBeNull();
  });
});
