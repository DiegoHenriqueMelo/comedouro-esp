import { describe, expect, it } from "vitest";
import { ErroDeDominio } from "../domain/shared/erro-de-dominio.js";
import { MemoryFeederRepository } from "../infra/memory/memory-repositories.js";
import type { ConfigPayload } from "./dto.js";
import { FeederService } from "./feeder-service.js";

const cafe = { hora: "07:30", porcoes: 2, ativo: true };

function setup() {
  const repository = new MemoryFeederRepository();
  const published: ConfigPayload[] = [];
  const device = {
    publishConfiguration: async (payload: ConfigPayload) => {
      published.push(payload);
    },
  };
  return {
    repository,
    published,
    service: new FeederService(repository, device),
  };
}

describe("FeederService", () => {
  it("na primeira execução, cria o alimentador padrão e salva", async () => {
    const { service, repository } = setup();

    const feeder = await service.get();

    expect(feeder.version).toBe(1);
    expect((await repository.load())?.version).toBe(1);
  });

  it("trocar a agenda salva, e a configuração publicada leva a versão nova, a agenda e o fuso POSIX", async () => {
    const { service, repository, published } = setup();

    const feeder = await service.updateSchedule([cafe]);

    expect(feeder.version).toBe(2);
    expect((await repository.load())?.version).toBe(2);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ versao: 2, agenda: [cafe] });
    expect(published[0]?.config.fusoPosix).toBe("<-03>3");
  });

  it("uma agenda inválida não é salva nem publicada", async () => {
    const { service, repository, published } = setup();

    await expect(service.updateSchedule([cafe, cafe])).rejects.toThrow(
      ErroDeDominio,
    );

    expect((await repository.load())?.version).toBe(1);
    expect(published).toEqual([]);
  });

  it("se a gravação falha, nada é publicado", async () => {
    const { service, repository, published } = setup();
    await service.get();
    repository.save = async () => {
      throw new Error("banco fora do ar");
    };

    await expect(service.updateSchedule([cafe])).rejects.toThrow(
      "banco fora do ar",
    );

    expect(published).toEqual([]);
  });

  it("se o dispositivo está fora do ar, a mudança continua salva", async () => {
    const repository = new MemoryFeederRepository();
    const service = new FeederService(repository, {
      publishConfiguration: async () => {
        throw new Error("broker fora do ar");
      },
    });

    const feeder = await service.updateSchedule([cafe]);

    expect(feeder.version).toBe(2);
    expect((await repository.load())?.version).toBe(2);
  });
});
