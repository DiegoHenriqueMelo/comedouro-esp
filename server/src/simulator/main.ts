import { createInterface } from "node:readline";
import { loadEnvFiles } from "../env.js";
import { systemClock } from "../infra/memory/memory-repositories.js";
import { MqttSimulator } from "./mqtt-simulator.js";

// O "ESP32 de mentira" como programa: `pnpm simulador`. Conecta no broker do servidor e se comporta como a placa.

loadEnvFiles();

const url =
  process.env.SIM_MQTT_URL ??
  process.env.MQTT_URL ??
  `mqtt://127.0.0.1:${process.env.MQTT_BROKER_PORT ?? "1883"}`;
const catEats = Number(process.env.SIM_CAT_EATS_MINUTES ?? "10");

const username = process.env.MQTT_USERNAME;
const password = process.env.MQTT_PASSWORD;

const simulator = new MqttSimulator({
  url,
  feederId: process.env.FEEDER_ID ?? "principal",
  clock: systemClock,
  device: { catEatsAfterMinutes: catEats > 0 ? catEats : null },
  log: (message) => console.log(`[simulador] ${message}`),
  ...(username ? { username } : {}),
  ...(password ? { password } : {}),
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
