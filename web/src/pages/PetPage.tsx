import { useEffect, useState } from "react";
import { api, type Pet, type PetInput, type Species } from "../api";
import { useAction, useLoad } from "../hooks";
import { fieldFor, messageFor, petAge } from "../messages";
import { resizePhoto } from "../photo";
import { navigate } from "../router";
import {
  Card,
  ConfirmDialog,
  FeedbackLine,
  Field,
  Icon,
  LoadError,
  Loading,
  parseNumber,
} from "../ui";

// O cadastro de um pet: novo (id null) ou um que já existe.
export function PetPage(props: { id: string | null }) {
  const { id } = props;
  const saved = useLoad(() =>
    id === null ? Promise.resolve(null) : api.pet(id),
  );

  if (saved.loading) return <Loading />;
  if (id !== null && !saved.data) {
    return (
      <LoadError
        message={messageFor(saved.error)}
        onRetry={() => void saved.reload()}
      />
    );
  }
  return <PetForm pet={saved.data} />;
}

type Form = {
  nome: string;
  especie: Species;
  nascimento: string;
  peso: string;
};

function toForm(pet: Pet | null): Form {
  return {
    nome: pet?.nome ?? "",
    especie: pet?.especie ?? "gato",
    nascimento: pet?.nascimento ?? "",
    peso:
      pet?.pesoKg === null || !pet ? "" : String(pet.pesoKg).replace(".", ","),
  };
}

// Vazio vira null; um peso que não é número volta como erro do campo.
export function fromPetForm(form: Form): PetInput | { invalid: "pesoKg" } {
  const peso = form.peso.trim() === "" ? null : parseNumber(form.peso);
  if (peso !== null && Number.isNaN(peso)) return { invalid: "pesoKg" };
  return {
    nome: form.nome,
    especie: form.especie,
    nascimento: form.nascimento === "" ? null : form.nascimento,
    pesoKg: peso,
  };
}

// Foto: a que já está salva, uma nova escolhida agora, ou "remover".
type PhotoChange =
  | { kind: "manter" }
  | { kind: "nova"; blob: Blob; preview: string }
  | { kind: "remover" };

export function PetForm(props: { pet: Pet | null }) {
  const { pet } = props;
  const [form, setForm] = useState<Form>(() => toForm(pet));
  const [photo, setPhoto] = useState<PhotoChange>({ kind: "manter" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Se o pet foi criado e só a foto falhou, tentar de novo edita este, em vez de criar outro.
  const [created, setCreated] = useState<Pet | null>(null);
  const action = useAction();

  // Libera a prévia da foto quando ela sai da tela.
  useEffect(
    () => () => {
      if (photo.kind === "nova") URL.revokeObjectURL(photo.preview);
    },
    [photo],
  );

  const set = (key: keyof Form, value: string) => {
    setForm({ ...form, [key]: value });
    setErrors({});
    action.setFeedback(null);
  };

  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    setErrors({});
    try {
      const blob = await resizePhoto(file);
      setPhoto({ kind: "nova", blob, preview: URL.createObjectURL(blob) });
    } catch {
      setErrors({ foto: "Não deu para abrir esta foto. Tente outra." });
    }
  };

  const save = async () => {
    setErrors({});
    const input = fromPetForm(form);
    if ("invalid" in input) {
      setErrors({ pesoKg: "Digite um número, como 4,2." });
      return;
    }
    let failure: unknown = null;
    const ok = await action.run(
      async () => {
        try {
          const existing = pet ?? created;
          const savedPet = existing
            ? await api.updatePet(existing.id, input)
            : await api.createPet(input);
          if (!existing) setCreated(savedPet);
          if (photo.kind === "nova") {
            await api.uploadPetPhoto(savedPet.id, photo.blob);
          } else if (photo.kind === "remover" && pet?.foto) {
            await api.removePetPhoto(savedPet.id);
          }
        } catch (err) {
          failure = err;
          throw err;
        }
      },
      { ok: "Pet salvo.", error: (err) => messageFor(err) },
    );
    if (ok) {
      navigate("/");
      return;
    }
    const key = fieldFor(failure);
    if (key) {
      setErrors({ [key]: messageFor(failure) });
      action.setFeedback(null);
    }
  };

  const shown =
    photo.kind === "nova"
      ? photo.preview
      : photo.kind === "remover"
        ? null
        : (pet?.foto ?? null);

  return (
    <>
      <header className="page-header">
        <h1>{pet ? pet.nome : "Novo pet"}</h1>
      </header>

      <Card>
        <div className="pet-photo-row">
          <PetAvatar name={form.nome} src={shown} size="large" />
          <div className="stack">
            <label className="button">
              {shown ? "Trocar foto" : "Escolher foto"}
              <input
                className="visually-hidden"
                type="file"
                accept="image/*"
                onChange={(e) => void choosePhoto(e.target.files?.[0])}
              />
            </label>
            {shown && (
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setPhoto({ kind: "remover" })}
              >
                Remover foto
              </button>
            )}
          </div>
        </div>
        {errors.foto && <p className="field-error">{errors.foto}</p>}
      </Card>

      <Card>
        <Field label="Nome" error={errors.nome ?? null}>
          <input
            className="input"
            autoComplete="off"
            maxLength={30}
            aria-invalid={errors.nome !== undefined}
            value={form.nome}
            onChange={(e) => set("nome", e.target.value)}
          />
        </Field>

        <fieldset className="choices">
          <legend className="field-label">Espécie</legend>
          <div className="inline">
            {(["gato", "cachorro"] as const).map((especie) => (
              <label key={especie} className="choice choice-inline">
                <input
                  type="radio"
                  name="especie"
                  value={especie}
                  checked={form.especie === especie}
                  onChange={() => set("especie", especie)}
                />
                {especie === "gato" ? "Gato" : "Cachorro"}
              </label>
            ))}
          </div>
          {errors.especie && <p className="field-error">{errors.especie}</p>}
        </fieldset>

        <Field
          label="Nascimento"
          hint={
            form.nascimento
              ? `Idade: ${petAge(form.nascimento)}.`
              : "Opcional. Se não souber o dia, use um aproximado."
          }
          error={errors.nascimento ?? null}
        >
          <input
            className="input"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            aria-invalid={errors.nascimento !== undefined}
            value={form.nascimento}
            onChange={(e) => set("nascimento", e.target.value)}
          />
        </Field>

        <Field
          label="Peso, em kg"
          hint="Opcional."
          error={errors.pesoKg ?? null}
        >
          <input
            className="input"
            inputMode="decimal"
            aria-invalid={errors.pesoKg !== undefined}
            value={form.peso}
            onChange={(e) => set("peso", e.target.value)}
          />
        </Field>
      </Card>

      <FeedbackLine feedback={action.feedback} />
      <button
        type="button"
        className="button button-primary"
        disabled={action.busy}
        onClick={() => void save()}
      >
        {action.busy ? "Salvando…" : pet ? "Salvar" : "Cadastrar pet"}
      </button>

      {pet && <RemovePet id={pet.id} nome={pet.nome} />}
    </>
  );
}

// A foto do pet, ou a primeira letra do nome num círculo pêssego.
export function PetAvatar(props: {
  name: string;
  src: string | null;
  size?: "large";
}) {
  const className =
    props.size === "large" ? "pet-avatar pet-avatar-large" : "pet-avatar";
  if (props.src) {
    return <img className={className} src={props.src} alt="" />;
  }
  const initial = props.name.trim().charAt(0).toUpperCase();
  return (
    <span className={className} aria-hidden="true">
      {initial || <Icon name="foto" />}
    </span>
  );
}

function RemovePet(props: { id: string; nome: string }) {
  const [confirming, setConfirming] = useState(false);
  const action = useAction();

  const remove = async () => {
    const ok = await action.run(() => api.removePet(props.id), {
      ok: "Pet removido.",
      error: (err) => messageFor(err),
    });
    if (ok) navigate("/");
  };

  return (
    <>
      <button
        type="button"
        className="button button-quiet"
        onClick={() => setConfirming(true)}
      >
        Remover {props.nome}
      </button>
      {confirming && (
        <ConfirmDialog
          title={`Remover ${props.nome}?`}
          confirmLabel="Remover"
          busyLabel="Removendo…"
          busy={action.busy}
          feedback={action.feedback}
          onConfirm={() => void remove()}
          onCancel={() => {
            setConfirming(false);
            action.setFeedback(null);
          }}
        >
          O cadastro e a foto são apagados.
        </ConfirmDialog>
      )}
    </>
  );
}
