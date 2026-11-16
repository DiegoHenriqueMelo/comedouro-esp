import { describe, expect, it } from "vitest";
import { User } from "./user.js";

const now = new Date("2026-11-16T12:00:00.000Z");
const ana = {
  sub: "google-123",
  email: "ana@example.com",
  name: "Ana Souza",
  picture: "https://example.com/ana.jpg",
};

describe("User", () => {
  it("nasce com os dados do login", () => {
    const user = User.create("u1", ana, now);

    expect(user.toProps()).toEqual({
      id: "u1",
      googleSub: "google-123",
      email: "ana@example.com",
      name: "Ana Souza",
      picture: "https://example.com/ana.jpg",
      createdAt: now,
    });
  });

  it("sem nome no Google, usa o começo do e-mail", () => {
    const user = User.create("u1", { ...ana, name: "  " }, now);

    expect(user.name).toBe("ana");
  });

  it("um login novo atualiza nome, e-mail e foto, e diz que mudou", () => {
    const user = User.create("u1", ana, now);

    const changed = user.updateFrom({
      ...ana,
      name: "Ana S.",
      picture: null,
    });

    expect(changed).toBe(true);
    expect(user.name).toBe("Ana S.");
    expect(user.picture).toBeNull();
    expect(user.googleSub).toBe("google-123");
  });

  it("um login com os mesmos dados não muda nada", () => {
    const user = User.create("u1", ana, now);

    expect(user.updateFrom(ana)).toBe(false);
  });

  it("mexer nas props devolvidas não muda o usuário", () => {
    const user = User.create("u1", ana, now);

    user.toProps().name = "Outro";

    expect(user.name).toBe("Ana Souza");
  });
});
