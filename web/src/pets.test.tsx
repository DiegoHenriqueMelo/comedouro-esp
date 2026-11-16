import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, type Pet } from "./api";
import { petAge, petLine } from "./messages";
import { fromPetForm, PetForm } from "./pages/PetPage";
import * as photo from "./photo";
import { parseRoute, petPath } from "./router";

const mingau: Pet = {
  id: "p1",
  nome: "Mingau",
  especie: "gato",
  nascimento: "2023-05-10",
  pesoKg: 4.2,
  foto: null,
  criadoEm: "2026-11-16T12:00:00.000Z",
};

beforeEach(() => window.history.replaceState(null, "", "/pets/novo"));
afterEach(() => vi.restoreAllMocks());

describe("idade e legenda", () => {
  const now = new Date(2026, 10, 16);

  it("conta anos e meses completos", () => {
    expect(petAge("2023-05-10", now)).toBe("3 anos e 6 meses");
    expect(petAge("2025-11-16", now)).toBe("1 ano");
    expect(petAge("2026-06-20", now)).toBe("4 meses");
    expect(petAge("2026-10-16", now)).toBe("1 mês");
    expect(petAge("2026-11-01", now)).toBe("menos de 1 mês");
  });

  it("a legenda junta espécie, idade e peso, pulando o que falta", () => {
    expect(petLine(mingau, now)).toBe("Gato · 3 anos e 6 meses · 4,2 kg");
    expect(
      petLine({ especie: "cachorro", nascimento: null, pesoKg: null }, now),
    ).toBe("Cachorro");
  });
});

describe("rotas dos pets", () => {
  it("/pets/novo é um cadastro novo; /pets/<id>, um que existe", () => {
    expect(parseRoute("/pets/novo")).toEqual({ name: "pet", id: null });
    expect(parseRoute("/pets/p1")).toEqual({ name: "pet", id: "p1" });
    expect(petPath(null)).toBe("/pets/novo");
    expect(petPath("p1")).toBe("/pets/p1");
  });
});

describe("fromPetForm", () => {
  it("vazio vira null, vírgula vira ponto, e peso que não é número aponta o campo", () => {
    const form = {
      nome: "Mingau",
      especie: "gato" as const,
      nascimento: "",
      peso: "4,2",
    };

    expect(fromPetForm(form)).toEqual({
      nome: "Mingau",
      especie: "gato",
      nascimento: null,
      pesoKg: 4.2,
    });
    expect(fromPetForm({ ...form, peso: "" })).toMatchObject({ pesoKg: null });
    expect(fromPetForm({ ...form, peso: "quatro" })).toEqual({
      invalid: "pesoKg",
    });
  });
});

describe("PetForm", () => {
  it("cadastra um pet novo e volta para a lista", async () => {
    const create = vi.spyOn(api, "createPet").mockResolvedValue(mingau);
    render(<PetForm pet={null} />);

    await userEvent.type(screen.getByLabelText("Nome"), "Mingau");
    await userEvent.type(screen.getByLabelText(/Peso/), "4,2");
    await userEvent.click(
      screen.getByRole("button", { name: "Cadastrar pet" }),
    );

    expect(create).toHaveBeenCalledWith({
      nome: "Mingau",
      especie: "gato",
      nascimento: null,
      pesoKg: 4.2,
    });
    expect(window.location.pathname).toBe("/");
  });

  it("com foto escolhida, envia a foto reduzida depois de salvar", async () => {
    vi.spyOn(api, "createPet").mockResolvedValue(mingau);
    const upload = vi.spyOn(api, "uploadPetPhoto").mockResolvedValue(mingau);
    const small = new Blob(["foto"], { type: "image/jpeg" });
    vi.spyOn(photo, "resizePhoto").mockResolvedValue(small);
    URL.createObjectURL = vi.fn(() => "blob:previa");
    URL.revokeObjectURL = vi.fn();
    render(<PetForm pet={null} />);

    await userEvent.type(screen.getByLabelText("Nome"), "Mingau");
    await userEvent.upload(
      screen.getByLabelText("Escolher foto"),
      new File(["grande"], "gato.jpg", { type: "image/jpeg" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Cadastrar pet" }),
    );

    expect(upload).toHaveBeenCalledWith("p1", small);
  });

  it("se só a foto falhar, tentar de novo não cria outro pet", async () => {
    const create = vi.spyOn(api, "createPet").mockResolvedValue(mingau);
    const update = vi.spyOn(api, "updatePet").mockResolvedValue(mingau);
    vi.spyOn(api, "uploadPetPhoto")
      .mockRejectedValueOnce(new ApiError(0, "sem_conexao"))
      .mockResolvedValueOnce(mingau);
    vi.spyOn(photo, "resizePhoto").mockResolvedValue(
      new Blob(["foto"], { type: "image/jpeg" }),
    );
    URL.createObjectURL = vi.fn(() => "blob:previa");
    URL.revokeObjectURL = vi.fn();
    render(<PetForm pet={null} />);

    await userEvent.type(screen.getByLabelText("Nome"), "Mingau");
    await userEvent.upload(
      screen.getByLabelText("Escolher foto"),
      new File(["x"], "gato.jpg", { type: "image/jpeg" }),
    );
    const button = await screen.findByRole("button", { name: "Cadastrar pet" });
    await userEvent.click(button);
    expect(
      await screen.findByText("Sem conexão com o servidor."),
    ).toBeInTheDocument();

    await userEvent.click(button);

    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("p1", expect.anything());
  });

  it("um erro de regra aparece embaixo do campo", async () => {
    vi.spyOn(api, "createPet").mockRejectedValue(
      new ApiError(422, "nascimento_invalido"),
    );
    render(<PetForm pet={null} />);

    await userEvent.type(screen.getByLabelText("Nome"), "Mingau");
    await userEvent.click(
      screen.getByRole("button", { name: "Cadastrar pet" }),
    );

    expect(
      await screen.findByText("O nascimento precisa ser uma data até hoje."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nascimento/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("editar: remover a foto apaga no servidor ao salvar", async () => {
    vi.spyOn(api, "updatePet").mockResolvedValue(mingau);
    const remove = vi.spyOn(api, "removePetPhoto").mockResolvedValue(mingau);
    render(<PetForm pet={{ ...mingau, foto: "/v1/pets/p1/foto?v=1" }} />);

    await userEvent.click(screen.getByRole("button", { name: "Remover foto" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(remove).toHaveBeenCalledWith("p1");
  });

  it("remover o pet pede confirmação", async () => {
    const remove = vi.spyOn(api, "removePet").mockResolvedValue(null);
    render(<PetForm pet={mingau} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Remover Mingau" }),
    );
    expect(remove).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Remover de vez" }),
    );

    expect(remove).toHaveBeenCalledWith("p1");
    expect(window.location.pathname).toBe("/");
  });
});
