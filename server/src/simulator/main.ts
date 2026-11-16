import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { loadEnvFiles } from "../env.js";
import { systemClock } from "../infra/memory/memory-repositories.js";
import { MqttSimulator } from "./mqtt-simulator.js";

// O "ESP32 de mentira" como programa: `pnpm simulador`. Conecta no broker do servidor e se comporta como a placa.

loadEnvFiles();

const url =
  process.env.SIM_MQTT_URL ??
  `mqtt://127.0.0.1:${process.env.MQTT_BROKER_PORT ?? "1883"}`;
const catEats = Number(process.env.SIM_CAT_EATS_MINUTES ?? "10");

// O simulador pareia como o ESP32 vai parear: troca o código de 6 dígitos que o app mostra pelo usuário e
// pela senha MQTT, e guarda os dois num arquivo (no ESP32, na memória permanente, a NVS).
const server =
  process.env.SIM_SERVIDOR ?? `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
const store = resolve(process.env.SIM_ARQUIVO ?? ".simulador.json");
type Saved = { usuario: string; senha: string };

async function pairWith(codigo: string): Promise<Saved> {
  const res = await fetch(`${server}/v1/dispositivos/parear`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ codigo }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    console.error(
      `[simulador] o servidor recusou o código (${res.status} ${String(body.motivo ?? "")}).`,
    );
    process.exit(1);
  }
  const saved = { usuario: String(body.usuario), senha: String(body.senha) };
  writeFileSync(store, JSON.stringify(saved, null, 2));
  console.log(`[simulador] pareado. Credencial guardada em ${store}.`);
  return saved;
}

const codigo = process.env.SIM_CODIGO;
let saved: Saved | null = null;
if (codigo) {
  saved = await pairWith(codigo);
} else if (existsSync(store)) {
  saved = JSON.parse(readFileSync(store, "utf8")) as Saved;
} else {
  console.error(
    [
      "[simulador] ainda não pareado.",
      "No app, adicione um comedouro do tipo “Tenho um aparelho”: ele mostra um código de 6 dígitos.",
      "Depois rode, com o servidor no ar:",
      "  SIM_CODIGO=<código> pnpm simulador",
    ].join("\n"),
  );
  process.exit(1);
}

const simulator = new MqttSimulator({
  url,
  feederId: saved.usuario,
  clock: systemClock,
  device: { catEatsAfterMinutes: catEats > 0 ? catEats : null },
  log: (message) => console.log(`[simulador] ${message}`),
  username: saved.usuario,
  password: saved.senha,
  // Como o ESP32 (F6): esquece a credencial e volta a esperar um código.
  onRefused: () => {
    rmSync(store, { force: true });
    console.log(
      "[simulador] credencial apagada. Gere um código no app e rode com SIM_CODIGO=<código>.",
    );
    process.exit(1);
  },
});
simulator.startTicking();

console.log(`[simulador] conectando em ${url}`);
console.log(
  [
    "Comandos (digite e aperte Enter):",
    "  tigela <gramas>     coloca ração na tigela (ex.: tigela 30)",
    "  garrafa <gramas>    muda o que resta na garrafa (ex.: garrafa 50)",
    "  balanca on|off      liga ou desliga a balança",
    "  nivel on|off        liga ou desliga o sensor de nível",
    "  estado              mostra o estado atual",
    "  cair                desliga sem avisar, como numa queda de luz",
    "  sair                desliga avisando",
  ].join("\n"),
);

let sensors = { scale: true, level: true };

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  const [command, value] = line.trim().toLowerCase().split(/\s+/);
  const number = Number(value);

  if (command === "tigela" && Number.isFinite(number)) {
    simulator.device.setBowlGrams(number);
  } else if (command === "garrafa" && Number.isFinite(number)) {
    simulator.device.setBottleGrams(number);
  } else if (command === "balanca" && (value === "on" || value === "off")) {
    sensors = { ...sensors, scale: value === "on" };
    simulator.device.setSensors(sensors);
  } else if (command === "nivel" && (value === "on" || value === "off")) {
    sensors = { ...sensors, level: value === "on" };
    simulator.device.setSensors(sensors);
  } else if (command === "estado") {
    console.log(simulator.device.state());
  } else if (command === "cair") {
    simulator.crash();
    process.exit(0);
  } else if (command === "sair") {
    await simulator.stop();
    process.exit(0);
  } else if (command) {
    console.log("[simulador] comando desconhecido");
  }
  simulator.tick();
});

process.on("SIGINT", async () => {
  await simulator.stop();
  process.exit(0);
});
