# Dispenser de Ração — Plano de Ação (Protótipo 3: garrafa)

> Projeto pessoal de aprendizado: alimentador automático para 1 gato, com ESP32, uma garrafa PET como reservatório, peças impressas em PETG, um servidor próprio com PWA no celular, comando de voz pela Alexa e avisos por notificação.
> Estrutura inspirada no tutorial [Como fazer um alimentador automático com Arduino](https://www.makerhero.com/blog/alimentador-automatico-com-arduino/), da MakerHero, com a comporta trocada por uma comporta dosadora.
> Modelo 3D (versão revestida, com balança e sensor de nível): https://claude.ai/artifact/6WYF1TqG1M9dxTngaVKYsh
> Plano reescrito em 29/10/2026. A versão anterior, com rotor e motor de passo, está em [arquivo/PLANO-DE-ACAO-v1-rotor.md](arquivo/PLANO-DE-ACAO-v1-rotor.md).
> Desde 30/10/2026, o servidor, o banco e o PWA têm uma trilha própria: [ROTEIRO-SISTEMA.md](ROTEIRO-SISTEMA.md).

---

## 1. Objetivo e regras do jogo

**Objetivo:** um dispenser simples e confiável o bastante para alimentar o gato todos os dias sem intervenção, aprendendo eletrônica e firmware embarcado no caminho.

**Princípio do protótipo 3:** o mínimo que resolve a dor. Peça comprada ou reaproveitada antes de peça projetada, nenhum fio ao alcance do gato e quase nada de solda. A exceção, de propósito, são dois sensores de segurança: a balança da tigela e o nível da garrafa. Qualquer outro extra só entra se um teste mostrar que faz falta.

**Ponto de partida:**

| Área | Nível |
|---|---|
| Eletrônica / microcontroladores | zero |
| Software | dev web/backend, JS/TS |
| Impressão 3D | não tem impressora, vai terceirizar |
| Alexa | tem Echo Dot (3ª a 5ª geração) |

**Restrições:**

- Orçamento: **até ~R$ 500**. Com o revestimento e os sensores, o normal fica perto de R$ 600; a seção 4.5 mostra como trazer para R$ 500.
- Tempo: **irregular**. O plano é dividido em marcos independentes, sem datas.
- Antes de comprar peças caras, adiantar o que der no simulador **Wokwi** (seção 6).

**Divisão do trabalho:**

| Parte | Quem faz | Como |
|---|---|---|
| CAD (OpenSCAD) | Claude | Você revisa, ajusta parâmetros e manda imprimir |
| Eletrônica e firmware | Você | Claude explica o conceito, você escreve e monta, Claude revisa e destrava |
| Servidor e interface (PWA) | Você | Mentoria com TDD: Claude explica, define os testes e revisa ([roteiro do sistema](ROTEIRO-SISTEMA.md)) |
| Repositório público | Você | Só no M10 |

---

## 2. Decisões fechadas

| # | Decisão | Escolha | Por quê |
|---|---|---|---|
| D1 | Estrutura | Garrafa PET de cabeça para baixo numa garganta presa a uma coluna, como no vídeo da MakerHero | Já foi montada e testada por outra pessoa; peças pequenas e fáceis de imprimir |
| D2 | Dosagem | Comporta com um **bolso** de ≈ 14 mL que gira 60° sobre uma mesa fixa com o furo de saída | A dose é o volume do bolso. No original a comporta fica aberta por tempo, e a quantidade varia com o nível da garrafa |
| D3 | Atuador | Servo **MG996R de 180°**, 5 V | Sabe a própria posição: sem driver e sem sensor. Engrenagem de metal, com força para cortar um grão preso |
| D4 | Sensores de segurança | **Balança na tigela** (célula de carga de 5 kg + HX711) e **sensor de nível** na tampa (VL53L1X) | A balança impede servir com a tigela cheia e confirma que a porção saiu; o nível avisa antes de acabar |
| D5 | Energia | Fonte de tomada 5 V / 3 A com selo do Inmetro, plugue P4, adaptador com borne e capacitor de 1000 µF. O cabo de 5 V entra por trás do pedestal, num protetor espiral | A parte de 127/220 V fica na tomada, fora do alcance do gato e fora da caixa impressa. Se o gato morder o cabo, são 5 V: sem risco de choque |
| D6 | Rede | Wi-Fi local. O ESP32 abre a conexão com o servidor; de fora de casa, o acesso é pelo PWA, via Tailscale ou nuvem (decidir na E13 do roteiro) | Sem porta aberta no roteador |
| D7 | Alexa | Espalexa local (emula Philips Hue) | 100% local e gratuito; só precisa de "servir agora" |
| D8 | Segurança do gato | Limite diário + intervalo mínimo, aplicados no firmware | Nenhum cliente (servidor, interface, Alexa, bug) consegue burlar |
| D9 | Relógio | Só NTP, sem módulo RTC | O ESP32 guarda a hora enquanto está ligado. Sem hora, a agenda espera, e a refeição perdida em até 2 h é servida quando a hora volta |
| D10 | Firmware | C++ com framework Arduino, PlatformIO no VS Code, ambiente extra para o Wokwi | O Espalexa é biblioteca Arduino; o Wokwi roda o mesmo código |
| D11 | Interface | PWA em React + Vite + TS servido pelo servidor Fastify, com HTTPS | Sem app nativo, sem loja, sem build mobile. Com HTTPS, o PWA instala de verdade e tem service worker |
| D12 | Configurar o Wi-Fi | Portal cativo (WiFiManager) | Troca de roteador sem regravar firmware |
| D13 | Avisos | LED da própria placa + notificação push do PWA. O Telegram só entra se o push não servir (decidir na E12 do roteiro) | Sem buzzer: o aviso chega mesmo com você fora |
| D14 | Contato com a ração | Garrafa PET (plástico de uso alimentar) e tigela de inox. Garganta, comporta, mesa e bico em **PETG natural**, removíveis sem ferramenta, com comporta reserva | Nada pintado ou com pigmento no caminho da comida; tudo sai para lavar |
| D15 | CAD | OpenSCAD paramétrico escrito pelo Claude; impressão terceirizada em mesa de até 200 × 200 mm | CAD como código, versionável. A garganta se ajusta à garrafa que você tiver |
| D16 | Compras | Mercado Livre para começar já; AliExpress só no que fica bem mais barato | Poucos itens; o frete longo não segura o projeto |
| D17 | Revestimento | Capa no estilo cafeteira, pedestal com a eletrônica dentro e tigela no alto (borda a ~10 cm do chão) | Nenhum fio nem peça móvel ao alcance do gato, e uma altura mais confortável para ele comer |
| D18 | Servidor | Fastify + MongoDB com DDD e TDD, como **companheiro** do ESP32 ([roteiro do sistema](ROTEIRO-SISTEMA.md)) | Aprender backend num domínio real; configuração, histórico longo e avisos num lugar só. O ESP32 continua decidindo sozinho: com o servidor fora do ar, o gato come |
| D19 | Conversa ESP32 ↔ servidor | MQTT; o ESP32 abre a conexão. O broker roda dentro do servidor. O contrato está em [protocolo-mqtt.md](protocolo-mqtt.md) | Configuração retida no broker, aviso de "offline" de graça e entrega garantida dos eventos |

---

## 3. Arquitetura

### 3.1 Visão geral

```
  Celular (PWA) ── HTTPS (Tailscale ou nuvem) ──┐
                                                ▼
                 ┌──────────────── Servidor (Fastify) ─────────────┐
                 │  /v1/* (API REST JSON) + PWA        MongoDB      │
                 │  configuração, histórico longo, avisos           │
                 └───────────────────────┬─────────────────────────┘
                                         │ MQTT (Mosquitto): o ESP32 abre a conexão
                 ┌──────────────── Wi-Fi da casa ──────────────────┐
  Echo Dot ──────┤   ESP32  ── agenda, limites, tigela (decide)    │
  (Hue local)    │          ── /api, /description.xml (Espalexa)   │
                 └─────────────────────────────────────────────────┘

  ESP32 GPIO 18     ──► Servo MG996R ──► comporta dosadora
  ESP32 GPIO 32/33  ◄── HX711 ◄── célula de carga (balança da tigela)
  ESP32 I²C 21/22   ◄── VL53L1X (nível, na tampa)
  ESP32 GPIO 2      ──► LED da placa (estado)
```

A regra que protege o gato (agenda, limite diário, intervalo mínimo, tigela) mora no ESP32. O servidor guarda a configuração, o histórico longo e os avisos, e serve o PWA. Se o servidor cair, o ESP32 segue a última configuração recebida e reenvia o histórico quando ele voltar. Detalhes no [roteiro do sistema](ROTEIRO-SISTEMA.md).

### 3.2 Fluxo de uma porção

1. Algum cliente pede porção: agenda, interface (`POST /v1/feed` no servidor, que repassa por MQTT) ou Alexa ("Alexa, liga o alimentador").
2. Tudo passa por **uma única porta de entrada**: `requestDispense(porcoes, origem)`.
3. A porta checa **limite diário** e **intervalo mínimo**. Se recusar, devolve o motivo e registra no histórico.
4. **Confere a tigela.** Com a balança parada (menos de 1 g de variação em 2 s), se a tigela tem mais que o limite (~10 g, configurável), não serve:
   - refeição agendada: tenta de novo a cada 20 min, por até 2 h; depois disso, pula e registra;
   - pedido manual: recusado com o motivo `tigela_com_racao`. Só o app pode mandar "servir mesmo assim".
5. Para cada porção, o servo leva a comporta do ângulo de encher (0°) ao de servir (60°), sem pressa (~0,5 s).
6. Espera o bolso esvaziar (~0,4 s) e dá duas sacudidas curtas (60° → 50° → 60°) para soltar o que grudou.
7. Volta para 0° e espera o bolso encher de novo (~0,6 s). Depois da última porção, desliga o sinal do servo (`detach`).
8. **Confirma na balança.** Se o peso não subiu perto de uma dose, entra em `VAZIO`: a garrafa esvaziou ou a comporta travou. O servo para de tentar, e o servidor avisa no celular.
9. Registra no histórico local e manda o evento para o servidor: hora, porções, gramas medidos, origem e resultado.
10. Lê o **sensor de nível**. Abaixo de 20%, o servidor avisa no celular com os dias que faltam.

**Se um sensor falhar** (sem leitura ou com valor impossível), o gato não fica sem comer. A agenda continua só com o limite diário e o intervalo mínimo, e você recebe o aviso "balança sem leitura" ou "sensor de nível sem leitura".

### 3.3 Máquina de estados do alimentador

```
         pedido aceito              tigela vazia
   OCIOSO ─────────────► CONFERINDO ────────────► INDO ──► ESVAZIANDO ──► VOLTANDO ──► ENCHENDO
     ▲                       │ tigela com ração   (0°→60°)  (espera +     (60°→0°)     (espera)
     ├────── recusa ─────────┘                              sacudidas)                    │
     │                                                  mais porções? ─ sim ─ volta para INDO
     │                                                                                    │ não
     ├──────────── peso subiu ◄──────────── CONFIRMANDO ◄─────────────────────────────────┘
     │                                           │ peso não subiu
     └── reconhecer o alerta ◄──── VAZIO ◄───────┘
```

Cada estado tem um prazo medido com `millis()`. Nenhum estado usa `delay()`, então o MQTT e a Alexa continuam respondendo enquanto o servo trabalha.

**Sem hora válida** (logo depois de ligar, sem internet), a agenda fica pausada. O "servir agora" continua funcionando, e o intervalo mínimo é contado pelo `millis()`.

### 3.4 Ligações e pinagem (ESP32 DevKit V1, 30 pinos)

```
 Fonte 5 V / 3 A ──► P4 + borne
                       (+) ─┬─ servo, fio vermelho
                            ├─ ESP32, pino VIN
                            └─ capacitor 1000 µF, perna longa
                       (−) ─┬─ servo, fio marrom
                            ├─ ESP32, pino GND
                            └─ capacitor, perna da faixa
 ESP32 GPIO 18 ─────────────── servo, fio laranja (sinal)

 ESP32 3V3 / GND ──► mini protoboard ─┬─ HX711 VCC / GND
                                      └─ VL53L1X VIN / GND
 ESP32 GPIO 32 / 33 ────────── HX711 DT / SCK
 ESP32 GPIO 21 / 22 ────────── VL53L1X SDA / SCL
 Célula de carga (4 fios) ──── HX711 E+, E−, A−, A+
```

| Função | GPIO | Observação |
|---|---|---|
| Sinal do servo | 18 | PWM pela biblioteca ESP32Servo. O sinal de 3,3 V do ESP32 funciona no MG996R |
| HX711 DT / SCK | 32 / 33 | Alimente o HX711 com **3,3 V**, não 5 V: a saída dele vai direto num pino do ESP32 |
| VL53L1X SDA / SCL | 21 / 22 | I²C padrão, alimentado em 3,3 V |
| LED de estado | 2 | LED azul da própria placa |

**Regras de alimentação:**

- O servo puxa direto do borne, **nunca** do pino 3V3 nem "através" do ESP32.
- Todos os GND se encontram no borne.
- O capacitor tem polaridade: a perna do lado da faixa vai no negativo. Invertido, ele estufa.
- Orçamento de corrente: servo de 0,5 a 1 A andando e até ~2,5 A se travar + ESP32 até ~0,5 A em pico de Wi-Fi. Por isso 3 A. A conta completa está na seção 3.4.1.

### 3.4.1 Cálculo de tensão e corrente

Duas fórmulas resolvem tudo aqui:

- **Lei de Ohm:** `V = R × I`. A tensão que se perde num fio é a resistência do fio vezes a corrente que passa por ele.
- **Potência:** `P = V × I`.

As correntes são as típicas dos datasheets, arredondadas para cima. O M3 confere tudo com o multímetro.

**1. Quem recebe qual tensão**

| Trilho | De onde vem | Quem usa | Faixa aceita |
|---|---|---|---|
| 5 V | Fonte de tomada, pelo borne | Servo MG996R | 4,8–7,2 V. Um pouco abaixo ele funciona, só mais fraco |
| 5 V | Fonte de tomada, pelo borne | ESP32, pino VIN → regulador da placa | Pelo menos ~4,5 V para o regulador manter os 3,3 V |
| 3,3 V | Regulador da placa do ESP32 (normalmente um AMS1117) | Chip do ESP32, HX711, VL53L1X | ESP32: 3,0–3,6 V |
| Sinais | Pinos do ESP32 | Servo (sinal), HX711, VL53L1X | Até 3,3 V. **Um pino do ESP32 não aguenta 5 V** |

O HX711 e o VL53L1X vão no 3,3 V porque mandam sinal de volta para o ESP32, e esse sinal sai na mesma tensão que alimenta o módulo. Alimentados com 5 V, eles mandariam 5 V para um pino que só aguenta 3,3 V.

**2. Quanto cada peça consome**

O regulador do ESP32 é linear: puxa do lado de 5 V a mesma corrente que entrega no lado de 3,3 V. Por isso o consumo em 3,3 V entra direto no total da fonte.

| Peça | Trilho | Parado | Servindo | Pior caso |
|---|---|---|---|---|
| ESP32 + placa, com Wi-Fi ligado | 3,3 V (vindo do 5 V) | 0,15 A | 0,15 A | 0,45 A (pico de transmissão) |
| HX711 + célula de carga | 3,3 V | 0,005 A | 0,005 A | 0,005 A |
| VL53L1X | 3,3 V | 0,02 A | 0,02 A | 0,04 A |
| Servo MG996R | 5 V | ~0,01 A (com `detach`) | 0,9 A (girando com carga) | 2,5 A (travado) |
| **Total puxado da fonte** | | **~0,19 A** | **~1,1 A** | **~3,0 A** |

A fonte de 3 A dá conta com folga no uso normal e fica no limite no pior caso. O pior caso só acontece se o servo travar bem num pico de Wi-Fi, e dura menos de 1 s, porque o firmware dá `detach` no fim do movimento. Uma fonte de 2 A não aguentaria o servo travado.

**3. O calor no regulador do ESP32**

No regulador linear, a tensão que sobra vira calor: `P = (5 V − 3,3 V) × I`.

- Uso normal: 1,7 V × 0,175 A ≈ **0,3 W**. Fica morno.
- Pico: 1,7 V × 0,5 A ≈ 0,85 W, só por instantes.

Se um dia entrar um módulo que consome mais de ~300 mA contínuos em 3,3 V, ele precisa de um regulador próprio.

**4. Queda de tensão nos fios**

Fio fino tem resistência, e a corrente "come" tensão nele (`V = R × I`). Na conta entram:

- **Resistência do fio de cobre por metro:** 22 AWG = 0,053 Ω; 24 AWG = 0,084 Ω; 26 AWG = 0,134 Ω; 28 AWG = 0,213 Ω.
- **O comprimento duas vezes,** porque a corrente vai pelo positivo e volta pelo negativo.
- **~0,03–0,05 Ω por encaixe** (plugue P4, ponta de jumper).

| Trecho | Conta | Resistência | Corrente | Queda |
|---|---|---|---|---|
| Cabo da fonte (1,5 m de 24 AWG) + plugue P4 | 3 m × 0,084 + 0,05 | ≈ 0,30 Ω | 1,1 A servindo / 3 A no pior caso | 0,33 V / 0,9 V |
| Servo: 30 cm do cabo dele + 40 cm de jumper, 26 AWG, + 4 encaixes | 1,4 m × 0,134 + 4 × 0,03 | ≈ 0,31 Ω | 0,9 A | 0,28 V |
| ESP32: 40 cm de jumper 26 AWG + 2 encaixes | 0,8 m × 0,134 + 2 × 0,03 | ≈ 0,17 Ω | 0,45 A | 0,08 V |

Com a fonte entregando 5,0 V:

| Ponto | Servindo | Pior caso |
|---|---|---|
| Borne | 5,0 − 0,33 ≈ **4,67 V** | 5,0 − 0,9 ≈ **4,1 V** |
| VIN do ESP32 | 4,67 − 0,08 ≈ **4,6 V** ✅ (acima de 4,5 V) | ≈ 4,0 V ⚠️ |
| 3,3 V da placa | 3,3 V ✅ | ≈ 2,9–3,0 V ⚠️ (o regulador perde ~1,1 V) |
| Servo | 4,67 − 0,28 ≈ **4,4 V** ⚠️ | — (travado) |

- **Servindo, funciona.** O ESP32 mantém os 3,3 V. O servo recebe ~4,4 V, um pouco abaixo dos 4,8 V do datasheet: gira, só um pouco mais lento e mais fraco.
- **No pior caso, o ESP32 encosta no limite por menos de 1 s.** Não chega a reiniciar (o detector de queda do ESP32 atua por volta de 2,4–2,8 V), mas o Wi-Fi pode falhar nesse instante. As proteções do item 7 cuidam disso.

**5. O capacitor de 1000 µF**

A fonte chaveada leva ~0,1 ms para reagir quando a corrente sobe de repente, como no arranque do servo. Nesse intervalo quem entrega a corrente é o capacitor, e a tensão dele cai `ΔV = I × Δt / C`:

2 A × 0,0001 s ÷ 0,001 F = **0,2 V**.

Sem o capacitor, o borne afundaria bem mais nesse instante. Por isso ele fica no borne, junto do servo e do ESP32.

**6. Consumo de energia**

Parado o tempo todo: 5 V × 0,19 A ≈ 1 W. Com a perda da própria fonte (~80% de eficiência), dá ~1,2 W na tomada, ou ~0,9 kWh por mês: **menos de R$ 1 de luz por mês**. As porções quase não contam: 4 por dia × 2 s × 5 W ≈ 0,01 Wh.

**7. O que fazer com essas contas**

1. **Fonte:** a de 5 V / 3 A está certa. Ao receber, meça a saída em vazio: a maioria entrega 5,1–5,2 V, e esses décimos a mais compensam parte da queda no cabo.
2. **Firmware:** `detach()` no fim de cada movimento e movimento devagar, que puxa menos corrente. Servo travado é o único jeito de chegar a 3 A.
3. **Fios do servo:** jumpers servem. Se no M3 o servo ficar fraco, troque só os fios de força dele (vermelho e marrom) por fio de 22 AWG direto no borne. A queda cai de ~0,28 V para ~0,15 V.
4. **Medição no M3** (seção 7): com o servo forçando contra a mão por 1 s, o borne precisa ficar em pelo menos 4,5 V e o pino 3V3 em pelo menos 3,2 V.

### 3.5 API REST (`/v1`)

Desde 30/10/2026, essa API fica no **servidor Fastify** (etapas E5 a E9 do [roteiro](ROTEIRO-SISTEMA.md)). Os comandos que mexem no aparelho (servir, tara, calibrar, testar o servo, reconhecer o alerta) chegam ao ESP32 por MQTT. O prefixo `/v1` continua, e a separação do `/api` do Espalexa também.

| Método | Rota | Corpo / resposta |
|---|---|---|
| `GET` | `/v1/status` | `{ hora, horaValida, wifi: { rssi }, estado, ultimaRefeicao, hoje: { porcoes, gramas }, limites, tigela: { gramas, estavel }, garrafa: { percentual, diasRestantes }, sensores: { balanca, nivel } }` |
| `POST` | `/v1/feed` | `{ porcoes: 1, forcar?: true }` → `202` aceito; `429` com `{ motivo: "limite_diario" \| "intervalo" \| "tigela_com_racao" }`; `409` se estiver servindo ou em `VAZIO`. O `forcar` só ignora a tigela, nunca os limites |
| `GET` | `/v1/schedules` | lista de horários |
| `PUT` | `/v1/schedules` | `[{ id, hora: "07:30", porcoes: 2, ativo: true }]` (máx. 8) |
| `GET` | `/v1/history?limit=50` | últimas refeições, mais recente primeiro |
| `GET` | `/v1/config` | configuração atual |
| `PUT` | `/v1/config` | `{ gramasPorPorcao, limiteDiarioPorcoes, intervaloMinimoMin, limiteTigelaGramas, fusoHorario, alturaGarrafaMm, anguloEncher, anguloServir }` |
| `POST` | `/v1/scale/tare` | zera a balança com a tigela vazia e limpa |
| `POST` | `/v1/scale/calibrate` | `{ gramas: 500 }` → calibra com um peso conhecido no prato |
| `POST` | `/v1/alerts/ack` | sai do `VAZIO` depois de reabastecer ou destravar |
| `POST` | `/v1/calibrate` | `{ porcoes: 20 }` → solta N porções para pesar; não conta no limite diário |
| `POST` | `/v1/servo/test` | `{ angulo }` → move o servo para achar os ângulos certos; só com o alimentador parado |

Fuso horário do Brasil (sem horário de verão desde 2019): `"<-03>3"` no formato POSIX.

### 3.6 Onde cada dado fica

| Dado | Onde | Por quê |
|---|---|---|
| Agenda, limites, gramas por porção, ângulos, capacidade, fuso | MongoDB no servidor (fonte da verdade) e cópia na NVS (`Preferences`) do ESP32 | O ESP32 segue a última configuração recebida, mesmo sem servidor |
| Hora da última refeição, tara e fator da balança | NVS | Precisam sobreviver a uma queda de luz |
| Histórico | LittleFS no ESP32, JSON Lines com buffer circular (~500 linhas), e MongoDB no servidor | O local cobre o período sem servidor e é reenviado depois; o servidor guarda tudo |
| Interface web | Servidor Fastify | O ESP32 não serve mais a interface |
| Senha do Wi-Fi, endereço e senha do broker MQTT | Guardados pela WiFiManager e na NVS | Nunca no código nem no git |
| Senhas e chaves do servidor | Variáveis de ambiente | Nunca no git |

### 3.7 Módulos do firmware

```
firmware/
├── platformio.ini            # envs: esp32dev (placa), wokwi (simulador) e native (testes no PC)
├── wokwi.toml + diagram.json # circuito do simulador
├── src/
│   ├── main.cpp              # setup/loop: só liga os módulos
│   ├── config.{h,cpp}        # leitura/escrita na NVS
│   ├── clock.{h,cpp}         # NTP e "a hora é válida?"
│   ├── feeder.{h,cpp}        # máquina de estados e servo
│   ├── sensors.{h,cpp}       # balança (HX711) e nível (VL53L1X)
│   ├── history.{h,cpp}       # buffer circular no LittleFS
│   ├── mqtt.{h,cpp}          # conversa com o servidor (protocolo da E9 do roteiro)
│   ├── alexa.{h,cpp}         # Espalexa
│   └── telegram.{h,cpp}      # só se o push do PWA não servir (M8)
├── lib/core/                 # LÓGICA PURA, sem Arduino.h
│   ├── scheduler.{h,cpp}     # "qual refeição vence agora?" e "perdi alguma?"
│   ├── guard.{h,cpp}         # limite diário, intervalo mínimo e tigela com ração
│   └── level.{h,cpp}         # % da garrafa e dias restantes
└── test/                     # testes Unity rodando no PC (pio test -e native)
```

A regra mais importante: **`lib/core` não inclui `Arduino.h`.** Recebe a hora como parâmetro e devolve decisões. Isso deixa o agendador, os limites e o nível testáveis no PC, sem placa e sem simulador.

### 3.8 Bibliotecas

| Biblioteca | Para quê | Atenção |
|---|---|---|
| ESP32Servo | Controlar o servo | `attach(18, 500, 2400)`; `detach()` quando parar, para não zumbir nem esquentar |
| HX711 (bogde) | Balança | Tara com a tigela vazia, calibração com um peso conhecido, média de 10 leituras |
| VL53L1X (Pololu) | Sensor de nível | `setROISize` estreita o feixe para ele não enxergar as paredes da garrafa |
| ESPAsyncWebServer + AsyncTCP | Servidor web do Espalexa | Use o fork mantido **ESP32Async** |
| espMqttClient (ou o cliente MQTT do ESP-IDF) | MQTT com o servidor (M6) | Precisa publicar em QoS 1. A PubSubClient só publica em QoS 0, e um evento pode se perder. A configuração tem cerca de 600 bytes: confira o buffer |
| ArduinoJson (v7) | JSON das mensagens MQTT | — |
| Espalexa | Alexa | `#define ESPALEXA_ASYNC` antes do include e `espalexa.begin(&server)` |
| WiFiManager (tzapu) | Portal cativo | Pode conflitar com o AsyncWebServer na compilação (enum `HTTP_GET` duplicado). Teste no M6; se der conflito, troque por ESPAsyncWiFiManager |
| UniversalTelegramBot + WiFiClientSecure | Telegram (M8, só se o push do PWA não servir) | A conexão HTTPS usa ~40 KB de RAM; consulte o Telegram a cada 5–10 s, sem travar o loop |
| NTP | Hora | Já vem no ESP32: `configTzTime("<-03>3", "a.st1.ntp.br", "pool.ntp.org")` |

---

## 4. Lista de compras

Preços são **faixas estimadas**. Confirme na hora de comprar.

> **Se você já comprou itens da versão com rotor:** o ESP32, a protoboard, os jumpers e o cabo continuam valendo. Motor de passo, driver, sensor hall, sensor IR, RTC e buzzer ficam guardados para o backlog (seção 9).

### 4.1 Mercado Livre (comprar já)

| Item | Qtd | Faixa | Observação |
|---|---|---|---|
| ESP32 DevKit V1, 30 pinos (CP2102 ou CH340) | 1 | R$ 35–55 | Destrava o M0 e o teste da Alexa (M2) |
| Fonte de tomada 5 V / 3 A com plugue P4 (5,5 × 2,1 mm) | 1 | R$ 20–35 | Fechada e **com selo do Inmetro**. Confira no anúncio: centro positivo |
| Adaptador P4 fêmea com borne de parafuso | 2 | R$ 4–10 | Um é reserva |
| Kit de jumpers fêmea-fêmea e macho-fêmea, 20 cm | 1 | R$ 10–20 | São eles que substituem a solda |
| Jumpers fêmea-fêmea de 40 cm | 1 kit | R$ 10–15 | A balança e o sensor de nível ficam longe do ESP32 |
| Mini protoboard de 170 pontos | 2 | R$ 5–10 | Divide o 3,3 V e o GND entre a balança e o sensor de nível. A segunda é reserva |
| Protetor espiral para cabos, 1 a 2 m | 1 | R$ 10–25 | Envolve o cabo da fonte, que é o único fora do aparelho |
| Kit iniciante: protoboard 400 ou 830 pontos + LEDs + resistores + botões | 1 | R$ 25–40 | Só para aprender no M1 |
| Cabo micro-USB **de dados** (muitos só carregam) | 1 | R$ 0–15 | |

### 4.2 AliExpress (pedir já; chega em 2 a 5 semanas)

| Item | Qtd | Faixa | Observação |
|---|---|---|---|
| Servo **MG996R 180°**, engrenagem de metal | 2 | R$ 30–50 | ⚠️ Não compre a versão **360°** (rotação contínua): ela não para no ângulo. O segundo é reserva |
| Célula de carga de **5 kg** (barra) + módulo HX711 | 1 kit | R$ 15–30 | De 5 kg, e não de 1 kg, para aguentar o gato apoiando na tigela. Se achar, compre o HX711 com os pinos já soldados |
| Sensor de distância **VL53L1X** | 1 | R$ 25–40 | O VL53L0X é mais barato e serve, mas erra mais com a garrafa quase vazia |
| Capacitor eletrolítico 1000 µF, 16 V (ou kit sortido) | 1 kit | R$ 5–12 | 10 V ou mais serve |
| Parafusos M3 de 8, 12 e 16 mm + porcas, e os parafusos da célula de carga (M4 e M5, confira no anúncio) | 1 kit | R$ 15–25 | Para a coluna, a prateleira, a célula e o fundo do pedestal |
| Pés de borracha adesivos | 1 cartela | R$ 5–10 | |

Se não quiser esperar, tudo isso também tem no Mercado Livre, uns 30–50% mais caro. Um servo no ML já destrava o M3.

### 4.3 Em casa ou no comércio local

| Item | Faixa | Observação |
|---|---|---|
| Garrafa PET de 2 L de parede lisa (água ou refrigerante), Ø ~105 mm | R$ 0 | Separe **2**: uma para errar o corte. Meça antes do M4 (seção 5) |
| Tigela de inox rasa, Ø ~13 cm | R$ 15–30 | Meça antes do M9 |
| Balança de cozinha com resolução de 1 g | R$ 0–35 | Calibra a dose e confere a célula de carga |
| Estilete, tesoura, lixa fina e chave Phillips pequena | R$ 0–20 | Cortar a garrafa e montar |
| Multímetro básico | R$ 0–60 | Emprestado serve. Útil para conferir a polaridade da fonte |
| Ferro de solda simples + estanho | R$ 0–60 | Só para os ~8 pontos do HX711 e da célula. Uma assistência técnica de celular faz por poucos reais |
| Cantoneira em L + bucha e parafuso para a parede | R$ 10–20 | Impede o dispenser de tombar (seção 5.2). Sem furar a parede: base de MDF de 40 × 30 cm e 15 mm, uns R$ 20–40 cortada na loja |

### 4.4 Impressão terceirizada

| Lote | Peças | Peso estimado | Material |
|---|---|---|---|
| Kit de teste (M4) | garganta, comporta + comporta reserva, cubo do braço do servo, mesa, bico, coluna interna e cupom de encaixe | 230–300 g | PETG; **natural, sem pigmento** nas peças que tocam a ração |
| Revestimento (M9) | pedestal (2 metades + fundo), prato da balança, capa da torre (2 metades), coluna da tampa e tampa articulada | 600–800 g | PETG ou PLA de qualquer cor: nada disso toca a ração |

**Antes de mandar imprimir:** envie o STL para o serviço e peça orçamento **por peso**. Confirme também o tamanho da mesa: o projeto assume no máximo 200 × 200 mm.

### 4.5 Total

| Bloco | Faixa |
|---|---|
| Eletrônica (ESP32, servos, fonte, P4, capacitor, jumpers, mini protoboards, balança, sensor de nível) | R$ 160–280 |
| Bancada de aprendizado (kit iniciante e cabo) | R$ 25–55 |
| Mecânica, cozinha e proteção (tigela, parafusos, pés, protetor espiral) | R$ 45–90 |
| Ferramentas, se não pegar emprestado | R$ 0–175 |
| Impressão (830–1.100 g) | R$ 165–495 |
| **Total** | **R$ 395–1.095** |

O normal, pegando as ferramentas emprestadas, fica **perto de R$ 600**. Quem mais pesa é o revestimento: é plástico. Para trazer para R$ 500:

1. **Revestimento em PLA com paredes de 1,6 mm e 15% de preenchimento.** É a maior economia, e nada dele toca a ração.
2. **Revestimento por último.** O dispenser funciona na bancada sem ele; dá para espalhar o gasto e só imprimir quando o mecanismo estiver aprovado.
3. **Comprar tudo no AliExpress**, inclusive o que está na seção 4.1.
4. **VL53L0X no lugar do VL53L1X.**

### 4.6 Onde comprar (links de 29/10/2026)

Os preços são os que apareciam na busca e mudam com frequência. **Dica de frete:** a Usinainfo tem quase toda a eletrônica (ESP32, servo, sensor de nível, fonte, P4, capacitor), então dá para juntar num pedido só.

| Item | Link principal | Alternativa | Preço visto | Conferir no anúncio |
|---|---|---|---|---|
| ESP32 DevKit V1, 30 pinos | [Usinainfo, USB-C + CP2102](https://www.usinainfo.com.br/esp32/esp32-wifi-e-bluetooth-com-usb-c-30-pinos-e-cp2102-9114.html) | [Mercado Livre](https://produto.mercadolivre.com.br/MLB-2896884857-modulo-esp32-wifi-bluetooth-esp32s-cp2102-30-pinos-_JM) | R$ 40–57 | **30 pinos** (anúncios misturam com 38). Se for USB-C, o cabo também é USB-C |
| Servo MG996R 180° (×2) | [Eletrogate](https://www.eletrogate.com/servo-towerpro-mg996r) · [Usinainfo](https://www.usinainfo.com.br/servo-motores/servo-motor-mg996r-tower-pro-180-11kgfcm-de-posicao-com-engrenagens-metalicas-4850.html) | [Mercado Livre](https://www.mercadolivre.com.br/servo-motor-mg996r-180-13kgcm-com-engrenagem-metalica/p/MLB36589828) · [AliExpress](https://pt.aliexpress.com/w/wholesale-mg996r-180.html) | R$ 25–45 cada | **180°**, nunca 360°. Tem clone com engrenagem de plástico: compre um numa loja conhecida |
| Célula de carga 5 kg + HX711 | [Mercado Livre](https://produto.mercadolivre.com.br/MLB-1482804201-modulo-hx711-adc-24-bits-celula-de-carga-5kg-para-arduino-_JM) | [Mercado Livre (outro)](https://produto.mercadolivre.com.br/MLB-1785750204-hx711-celula-de-carga-5kg-sensor-de-peso-balanca-_JM) · [AliExpress](https://pt.aliexpress.com/w/wholesale-hx711-5kg-load-cell.html) | R$ 35–40 | **5 kg**. As cores dos fios mudam entre fabricantes: siga a tabela do vendedor. Veja se vem com os parafusos da célula |
| Sensor de nível VL53L1X | [MakerHero](https://www.makerhero.com/produto/sensor-de-distancia-a-laser-vl53l1x-de-alta-precisao/) · [Usinainfo](https://www.usinainfo.com.br/sensores-de-proximidade-e-distancia/sensor-de-distancia-a-laser-vl53l1x-de-alta-precisao-4-a-400cm-8677.html) | [Mercado Livre](https://produto.mercadolivre.com.br/MLB-1992597755-vl53l1x-sensor-distancia-laser-400cm-lidar-arduino-_JM) · [AliExpress](https://pt.aliexpress.com/w/wholesale-vl53l1x.html) | varia bastante | **VL53L1X** (alguns títulos trocam com L0X). **Evite o "GY-53-L1X"**: ele tem um microcontrolador no meio e não funciona com a biblioteca do plano |
| Fonte 5 V / 3 A, plugue P4 | [Usinainfo](https://www.usinainfo.com.br/fonte-chaveada-usb-e-p4/fonte-de-alimentacao-5vdc-3a-plug-p4-3509.html) | [Mercado Livre](https://www.mercadolivre.com.br/fonte-chaveada-5v-3a-amperagem-real-plug-p4-estabilizada/p/MLB32029513) | R$ 19–46 | Plugue 5,5 × 2,1 mm, centro positivo, bivolt, selo do Inmetro |
| Adaptador P4 fêmea com borne (×2) | [Eletrogate](https://www.eletrogate.com/conector-adaptador-plug-p4-femea-com-borne) · [Usinainfo](https://www.usinainfo.com.br/conectores-e-adaptadores/jack-p4-femea-com-borne-a-parafuso-21x55mm-2843.html) | [Mercado Livre, kit com 10](https://www.mercadolivre.com.br/10-conector-plug-p4-femea-borne-fonte-cftv-fita-led-camera/p/MLB28169534) | R$ 13–20 o kit com 5 | Pino de **2,1 mm**, igual ao da fonte |
| Jumpers 20 cm, fêmea-fêmea e macho-fêmea | [Eletrogate F-F](https://www.eletrogate.com/jumpers-femea-femea-40-unidades-de-20-cm) · [Eletrogate M-F](https://www.eletrogate.com/jumpers-macho-femea-40-unidades-de-20-cm) | [Curto Circuito F-F](https://curtocircuito.com.br/kit-jumper-femea-femea-40-pcs.html) | R$ 7,90 cada kit | — |
| Jumpers 40 cm | [Mercado Livre, 120 un. (F-F, M-F, M-M)](https://produto.mercadolivre.com.br/MLB-1867545943-kit-120-jumpers-coloridos-40cm-f-f-m-f-m-m-_JM) | [Busca no ML](https://lista.mercadolivre.com.br/cabo-jumper-femea-40cm) | R$ 39–44 | Esse kit sozinho já substitui os dois de 20 cm |
| Mini protoboard 170 pontos (×2) | [MakerHero](https://www.makerhero.com/produto/mini-protoboard-170-pontos/) · [Eletrogate](https://www.eletrogate.com/mini-protoboard-170-pontos) | [Mercado Livre, 5 un.](https://produto.mercadolivre.com.br/MLB-1059753550-5x-mini-protoboard-170-pontos-breadboard-170-furos-arduino-_JM) | ~R$ 3 cada | — |
| Capacitor 1000 µF 16 V (×2) | [MakerHero](https://www.makerhero.com/produto/capacitor-eletrolitico-1000%c2%b5f-16v/) · [Usinainfo](https://www.usinainfo.com.br/capacitor-eletrolitico/capacitor-eletrolitico-1000uf-16v-3052.html) | [Baú da Eletrônica](https://www.baudaeletronica.com.br/produto/capacitor-eletrolitico-1000uf-16v-105c.html) | ~R$ 2 cada | Prefira o de **105 °C** |
| Protetor do cabo da fonte | [Amazon, espiral de 1,8 m para gatos](https://www.amazon.com.br/Yctze-Protetor-Espiral-Anti-mordida-Gatos/dp/B0FY3LWM76) | [Amazon, tubo PetCords 3 m](https://www.amazon.com.br/Protetor-cabo-para-gatos-PETCORDS/dp/B01I25HG9W) | — | Avaliações dizem que gato insistente fura espiral de PVC. O tubo é mais resistente; atrás de um móvel é melhor ainda |
| Kit iniciante (só para o M1) | [Mercado Livre: protoboard 830 + LEDs + resistores + botões](https://produto.mercadolivre.com.br/MLB-2647730844-kit-componentes-protoboard-830-furos-jumpers-leds-_JM) | [Busca no ML](https://lista.mercadolivre.com.br/kit-protoboard-830) | R$ 35–55 | — |
| Cabo USB de dados | [USB-C](https://lista.mercadolivre.com.br/cabo-usb-c-dados) · [micro-USB](https://lista.mercadolivre.com.br/cabo-micro-usb-dados) | — | R$ 10–20 | O tipo depende do ESP32 escolhido. Tem que ser **de dados** |
| Parafusos M3 + porcas | [Busca no ML](https://lista.mercadolivre.com.br/kit-parafuso-m3-porca) | [AliExpress](https://pt.aliexpress.com/w/wholesale-m3-screw-nut-kit.html) | R$ 15–25 | Kit sortido de 6 a 16 mm |
| Pés de borracha adesivos | [Busca no ML](https://lista.mercadolivre.com.br/pe-de-borracha-adesivo) | — | R$ 5–10 | Ø 10–15 mm |
| Tigela de inox rasa, Ø ~13 cm | [Busca no ML](https://lista.mercadolivre.com.br/comedouro-inox-gato-raso) | Pet shop do bairro | R$ 15–30 | Base de até ~92 mm para caber no anel do prato |
| Balança de cozinha, 1 g | [Busca no ML](https://lista.mercadolivre.com.br/balanca-cozinha-digital-1g) | — | R$ 20–35 | Só se não tiver em casa |
| Multímetro | [Busca no ML](https://lista.mercadolivre.com.br/multimetro-digital) | Emprestado | R$ 35–60 | O mais simples serve |
| Ferro de solda + estanho | [Ferro de 30 W](https://lista.mercadolivre.com.br/ferro-de-solda-30w) · [estanho 1 mm](https://lista.mercadolivre.com.br/estanho-solda-1mm) | Assistência técnica de celular | R$ 30–60 | Só para os ~8 pontos do HX711 |

**Links de busca:** nos itens comuns (parafusos, pés, tigela, ferramentas) e nos do AliExpress, o link é de uma busca já filtrada. Anúncios desse tipo somem rápido, e a busca continua funcionando.

**Ordem de compra sugerida:**

1. **Agora:** ESP32, fonte, adaptador P4 e jumpers. Destravam o M0 e o teste da Alexa (M2).
2. **Logo depois:** servos, balança e sensor de nível. Pelo AliExpress saem mais baratos, mas levam de 2 a 5 semanas.
3. **Por último:** protetor do cabo e tigela, que só entram na montagem final (M9).

---

## 5. Parâmetros mecânicos iniciais

Valores do modelo 3D. No OpenSCAD eles viram variáveis no topo do arquivo; os da garrafa saem da sua medição.

| Parâmetro | Valor inicial | Por quê |
|---|---|---|
| Garrafa | PET de 2 L, corpo Ø 105 mm. Gargalo cortado onde o ombro passa de **Ø 54 mm**; fundo cortado | A boca da garrafa (~21 mm) é estreita demais para ração de gato e forma ponte |
| Reservatório | ≈ 2 L | ≈ 0,9 kg de ração (a 0,45 kg/L); cerca de 2 semanas para um gato |
| Garganta | Cone de Ø 110 para Ø 36 mm em 50 mm de altura (paredes a ~53°) + colar de 25 mm para o ombro da garrafa | Ração para de escorrer abaixo de ~40° |
| Comporta | Leque de raio 70 mm, bolso de Ø 36 mm a 48 mm do eixo. Espessura = 1,2 × a maior medida do grão, no mínimo 6 mm (10 mm para grão de 8 mm; seção 5.2) | Com 10 mm, bolso de ≈ 10 mL → ≈ 4,6 g por giro. **Calibrar com balança** |
| Giro | 0° para encher, 60° para servir | O furo de saída fica a 60° da garganta, em volta do eixo do servo |
| Mesa | 4 mm, furo de saída de Ø 38–40 mm | Um pouco maior que o bolso, para ele esvaziar inteiro |
| Folgas da comporta | 1 mm para a garganta e 0,5 mm para a mesa | A garganta desce ~0,3 mm com a garrafa cheia (seção 5.2). Ajustar no cupom do M4 |
| Fixação da comporta | Braço redondo que vem com o servo, parafusado num **cubo** impresso. A comporta encaixa no cubo (sextavado) e trava com uma porca borboleta | A comporta sai para lavar sem ferramenta, e o servo fica montado |
| Bico | ≈ 57 mm, inclinação de 39°, virado 15° para o centro da tigela; termina ~5 mm acima da borda | Acima de 35° a ração desliza no PETG |
| Coluna | Perfil em U de 30 × 26 mm, 186 mm de altura, aberto atrás | O cabo do servo desce por dentro |
| Pedestal | 160 × 332 × 63 mm, frente em meia-lua; 2 metades + fundo | Guarda a eletrônica e levanta a tigela. Cada metade cabe na mesa de 200 mm |
| Tigela | Borda a ~10 cm do chão, sobre o prato da balança (Ø 142 mm, folga de 2 mm) | Altura mais confortável para o gato |
| Capa da torre | 160 × 206 × 189 mm, 2 metades; avança 26 mm sobre a tigela, com uma fenda só para o bico | Esconde o mecanismo. Paredes de 1,6–2 mm para economizar plástico |
| Coluna da tampa | 70 × 74 × 200 mm atrás da garrafa, com a dobradiça em cima | Leva o cabo do sensor de nível |
| Altura total | ~46 cm | |

**Sugestões para o serviço de impressão:** PETG, camada de 0,2 mm, 3 perímetros, 20–25% de preenchimento. Na comporta, 20% de preenchimento com 4 perímetros bastam (análise de elementos finitos, seção 5.2). No cubo, paredes cheias em volta do encaixe sextavado. Garganta impressa na posição de uso; as paredes a 53° dispensam suporte.

### 5.1 Peças em contato com a ração

| Peça | Material | Como sai | Limpeza |
|---|---|---|---|
| Tigela | Inox comprado | Solta no prato da balança | Todo dia ou a cada 2 dias; vai à lava-louças |
| Garrafa | PET reaproveitado | Sai pela garganta | Pano úmido ao reabastecer. Quando ficar riscada ou encardida, troque por outra garrafa |
| Garganta | PETG natural | Levanta do braço da coluna | Semanal, à mão |
| Comporta | PETG natural | Porca borboleta | Semanal, à mão; reveze com a reserva |
| Mesa | PETG natural | Encaixe com trava | Semanal, à mão |
| Bico | PETG natural | Encaixe | Semanal, à mão |

O PETG deforma com calor (a partir de ~70 °C), por isso as peças impressas são lavadas à mão, não na lava-louças.

**Regras de projeto para o CAD:**

1. **Nada que encosta na ração exige ferramenta para sair.** Encaixes, travas e porca borboleta.
2. **A parte que sai para lavar não leva fio nem servo.** O servo e o cubo ficam presos na prateleira da coluna.
3. **Paredes internas lisas, sem cantos vivos e sem texto em relevo** onde a ração passa.
4. **Borda do furo de entrada chanfrada** do lado em que a comporta fecha, para empurrar o grão em vez de prender.
5. **Nenhum fio ao alcance do gato.** Cabos só por dentro da coluna e do pedestal. O cabo da fonte sai por trás, rente ao chão, no protetor espiral.

**Para lavar com a capa:** abra a tampa, tire a garrafa, solte a frente da capa, e o resto sai como na tabela.

### 5.2 Cálculo mecânico: estresse, flexão e tombamento

**Premissas**

| Item | Valor |
|---|---|
| Ração com a garrafa cheia | 0,9 kg |
| Garrafa + garganta + tampa apoiada | ~0,15 kg |
| Peso pendurado no braço da coluna | ~1,05 kg → **10,3 N** |
| Gato | 4–5 kg |
| PETG impresso | resiste a ~35 MPa ao longo das camadas e ~20 MPa entre camadas; rigidez E ≈ 2.000 MPa |

**Fórmulas**

- **Peso:** `F = m × g`, com g = 9,81 m/s².
- **Momento (força × alavanca):** `M = F × d`.
- **Tensão de flexão:** `σ = M / S`, em que S é o módulo resistente da seção. Para um retângulo cheio, `S = b × h² / 6`.
- **Fator de segurança:** `FS = resistência / σ`. Em plástico impresso, acima de ~3 já está bom.

**1. Coluna e braço que seguram a garrafa**

O braço segura a garganta 80 mm à frente da coluna: `M = 10,3 N × 80 mm ≈ 824 N·mm`.

| Peça | Seção | S | σ | FS (entre camadas) |
|---|---|---|---|---|
| Braço da garganta | 26 × 20 mm, oco, paredes de 1,2 mm | ≈ 660 mm³ | ≈ 1,3 MPa | ≈ 15 |
| Coluna em U | 30 × 26 mm, paredes de 3 mm | ≈ 950 mm³ | ≈ 0,9 MPa | ≈ 22 |
| Parede da garganta | cone de 2,5 mm | — | < 0,1 MPa | sobra |

**Nada quebra com o peso da ração.** Mesmo assim, imprima a coluna **deitada**: assim a flexão puxa ao longo das camadas, e o FS sobe para ~40.

**2. A flexão e a folga da comporta**

A peça não quebra, mas verga, e é isso que importa aqui:

- **A coluna gira no topo:** `θ = M × L / (E × I) = 824 × 171 / (2.000 × 16.400) ≈ 0,0043 rad` (0,25°). Na garganta, 80 mm à frente, isso dá 0,0043 × 80 ≈ **0,34 mm** para baixo.
- **O braço verga:** `δ = F × L³ / (3 × E × I) = 10,3 × 80³ / (3 × 2.000 × 6.600) ≈` **0,13 mm**.
- **A mesa também desce**, menos, porque fica mais embaixo na coluna: ≈ 0,18 mm.

A folga entre a garganta e a comporta fecha uns **0,3 mm** (0,47 − 0,18) com a garrafa cheia. Dos 0,5 mm previstos sobraria ~0,2 mm. E o PETG ainda cede devagar sob carga constante (fluência), algo como 1,5 a 2 vezes em alguns meses. **A garganta pode passar a raspar na comporta.**

**Mudanças:**
- folga garganta–comporta de **1 mm**; um grão de 8–10 mm não entra nela;
- **coluna descendo até o fundo do pedestal**, parafusada no fundo e no tampo, para não girar na base;
- coluna impressa deitada.

**3. O servo contra a comporta**

- **Giro normal:** a ração se apoia nas paredes da garrafa (efeito silo), então sobre o furo de Ø 36 mm sobra só ~1 N de peso. Com o atrito da comporta, o giro pede ~0,03 N·m, uns **4%** do que o servo entrega (~0,85 N·m ≈ 8,5 kg·cm a 4,4 V). O giro é leve e a corrente fica baixa.
- **Grão preso na borda:** o servo travado empurra com `F = T / r`: 0,85 / 0,048 ≈ **18 N** no meio do bolso e ≈ 13 N na borda de fora (66 mm do eixo). Um grão de ração seca quebra com algo entre 10 e 40 N, conforme a marca (estimativa). **Pode cortar, pode travar.**

**Mudanças:**
- borda "de faca" no furo de entrada: cortar pede bem menos força que esmagar;
- firmware recuando ~10° e tentando de novo quando a porção não confirmar na balança;
- o teste do M4 com a ração do seu gato decide.

**4. Célula de carga e batentes**

| Situação | Carga | % dos 5 kg |
|---|---|---|
| Tigela + prato + ração | ~0,35 kg | 7% |
| Gato apoiando as patas na tigela | ~2–3 kg | 40–60% |
| Gato pulando na tigela (impacto ~2× o peso) | ~8–10 kg | 160–200% ⚠️ |

Uma célula de 5 kg costuma aguentar ~150% sem dano e verga só uns décimos de milímetro na carga máxima. Por isso os batentes precisam encostar logo depois dos 5 kg. No modelo 3D eles estão a 1,5 mm: **tarde demais**, a célula já teria entortado.

**Mudança:** batentes reguláveis (parafuso M3 com porca no pedestal). Para regular, coloque ~5 kg no prato (um pacote de arroz) e rosqueie cada batente até encostar.

**5. Gato em cima da capa**

O tampo da capa (a ~25 cm do chão, 160 × 206 mm) é um lugar convidativo para o gato subir. Um gato de 4–5 kg aterrissando faz ~50–100 N numa pata. Num tampo de 3 mm, isso dá **σ ≈ 10–19 MPa**, perto do que a chapa impressa aguenta: pode trincar ou afundar.

**Mudança:** tampo com nervuras por baixo, ou com 4–5 mm. Mas antes de o tampo quebrar, o conjunto tomba (item 6).

**6. Tombamento: o problema de verdade**

| | Garrafa cheia | Garrafa vazia |
|---|---|---|
| Massa total | ~2,3 kg | ~1,4 kg |
| Altura do centro de massa | ~195 mm | ~140 mm |

O lado mais fraco é o lateral: do centro de massa até a linha dos pés são só ~53 mm, porque os pés ficam 22 mm para dentro da borda.

- **Ângulo de tombamento:** `atan(53 / 195) ≈ 15°`.
- **Força de lado, no alto da garrafa (~40 cm do chão), que derruba:** `F = m × g × b / h = 2,3 × 9,81 × 0,053 / 0,40 ≈` **3 N** (0,3 kgf). Com a garrafa vazia, **1,8 N**.
- Para frente e para trás é um pouco melhor: ~6 a 9 N.

Um gato se esfregando empurra 5–20 N com facilidade (estimativa). **Do jeito que está, o dispenser tomba.**

| Mudança | Força de lado que derruba (garrafa cheia, no alto) |
|---|---|
| Como está | ~3 N |
| Pés na borda do pedestal (b = 80 mm) | ~4,5 N |
| + base de MDF ou compensado de 40 × 30 cm e 15 mm (~1,3 kg) parafusada embaixo | ~13 N |
| **Cantoneira presa na parede**, atrás da coluna da tampa | não tomba |

**Mudança:** encostar o dispenser na parede e prender a coluna da tampa com uma cantoneira. Se não der para furar a parede, use a base de MDF e mantenha o teste de tombamento do M9.

**7. A comporta em elementos finitos**

Simulação 3D da comporta com o servo travado num grão preso: [Estresse na Comporta](https://claude.ai/artifact/Dv5TEuQBPU5WHR36MwgujP). O código do solver está em `c:\diego\artefatos\fea-comporta.js`.

- **Montagem:** 15 mil nós e 71 mil tetraedros, eixo preso, grão empurrando a parede de trás do bolso com torque ÷ 48 mm.
- **Conferências:** as reações no eixo igualam a carga, e uma malha com o dobro de nós muda os máximos em menos de 5%.

| Torque | Maior tensão | Fator de segurança | Deslocamento |
|---|---|---|---|
| 0,85 N·m (grão preso, 5 V) | 0,65 MPa, na borda do eixo | ~54 | ~28 µm |
| 1,08 N·m (grão preso, 6 V) | 0,83 MPa | ~42 | ~35 µm |

A comporta é muito mais forte que o necessário. A espessura de 14 mm vem do volume do bolso, e não da força. Por isso ela pode ser impressa com menos preenchimento.

O ponto mais carregado é o encaixe do eixo, seguido das concordâncias de 5 mm entre o cubo e o leque. O anel de 4 mm por fora do bolso quase não trabalha.

**8. Espessura mínima da comporta**

Simulação para 14, 12, 10, 8 e 6 mm: [Espessura da Comporta](https://claude.ai/artifact/8jr6PQmxg2qJzBxKsbdSUE).

| Critério | Conta | Mínimo |
|---|---|---|
| Grão inteiro no bolso, mesmo de pé | 1,2 × maior medida do grão | **10 mm** para grão de 8 mm; 12 mm para grão de 10 mm |
| Resistência (segurança ≥ 4) | a tensão cresce com 1/espessura: 0,87 MPa com 10 mm e 1,4 MPa com 6 mm | ~1 mm |
| Impressão plana (peça de 140 mm) | abaixo disso o PETG empena e some a folga de 0,5 mm com a mesa | 6 mm |
| Dose | π × 18² × espessura | não limita: só muda os gramas por giro |

**Quem manda é o grão.** Meça a maior medida de uns 20 grãos da ração do seu gato e use 1,2 vez a maior delas. Com grão de 8 mm, a comporta vai de 14 para **10 mm**, e o resto fica assim:

- **Massa:** cai de 37 para 29 g por peça.
- **Dose:** 4,6 g por giro, então uma refeição de 20 g sai em 5 giros.
- **Segurança:** cai para 40×.

A economia é pequena: ~17 g contando a reserva, uns R$ 3–8. O custo de verdade está no revestimento.

No M4, imprima duas comportas de espessuras diferentes (por exemplo, 10 e 12 mm) no lugar da comporta + reserva, e teste as duas com a ração real. Se afinar, a garganta e a coluna descem o mesmo tanto (um parâmetro no OpenSCAD).

**Resumo do que o cálculo mudou**

| Achado | Mudança |
|---|---|
| As peças aguentam o peso com folga (FS > 15) | Nenhuma |
| A garganta desce ~0,3 mm com a garrafa cheia | Folga de 1 mm; coluna até o fundo do pedestal; coluna impressa deitada |
| O servo pode não cortar um grão duro | Borda de faca; recuar e tentar de novo; teste no M4 |
| Batentes da balança altos demais | Batentes reguláveis, ajustados com 5 kg |
| Tampo da capa no limite com o gato em cima | Nervuras ou 4–5 mm |
| Tomba com ~3 N de lado | Cantoneira na parede, ou base de MDF de 40 × 30 cm |
| A comporta aguenta ~54× a força do servo travado (elementos finitos) | Comporta com 20% de preenchimento e 4 perímetros; paredes cheias no encaixe do eixo |
| A espessura é limitada pelo grão, não pela força | Espessura = 1,2 × a maior medida do grão (10 mm para grão de 8 mm); duas espessuras no kit do M4 |

---

## 6. Simulador (Wokwi)

Dá para adiantar boa parte do firmware no Wokwi, dentro do VS Code, enquanto as peças não chegam. O simulador responde "meu firmware funciona?". Ele **não** responde "o dispenser funciona?": isso só a placa real e o kit impresso respondem.

| Parte | No Wokwi | Observação |
|---|---|---|
| LED, botão, `millis()` | ✅ | No simulador nada queima, então um LED sem resistor funciona. O M1 também precisa da protoboard real |
| Servo (lógica, ângulos, máquina de estados) | ✅ | O Wokwi tem um servo; dá para ver o braço girar |
| Servo (fonte, pico de corrente, reinício, barulho) | ❌ | Só na bancada (M3) |
| Agenda, limites, nível | ✅ | Melhor ainda: rodam no PC com `pio test -e native` |
| Balança (HX711) | ✅ | O Wokwi tem o módulo HX711 com a célula de carga simulada |
| Sensor de nível (VL53L1X) | ⚠️ | Provavelmente não existe no Wokwi; um potenciômetro faz o papel da distância |
| NTP e Telegram | ✅ | O ESP32 simulado acessa a internet pela rede `Wokwi-GUEST` |
| Conversa com o servidor (MQTT) | ⚠️ | O ESP32 simulado sai pela `Wokwi-GUEST`. Para alcançar o broker no seu PC, o Wokwi para VS Code tem um gateway privado (endereço `host.wokwi.internal`); conferir no M6. Até lá, o "ESP32 de mentira" da E9 do roteiro faz esse papel |
| NVS e LittleFS | ⚠️ | Funcionam, mas começam vazios a cada execução |
| Portal do WiFiManager e `alimentador.local` | ❌ | No simulador o ESP32 entra direto na rede do Wokwi |
| **Alexa** | ❌ | O Echo precisa achar o ESP32 na sua rede. Só com a placa real (M2) |
| **Mecânica** | ❌ | Escoamento, dose, grão preso: só o kit impresso (M4) |

**Como organizar:** três ambientes no `platformio.ini`: `esp32dev` (placa), `wokwi` (com `-D SIMULADOR`) e `native` (testes). Só o que muda entre placa e simulador fica atrás da flag, por exemplo pular a WiFiManager e entrar direto na `Wokwi-GUEST`. Todo o resto é o mesmo código.

---

## 7. Marcos

Cada marco termina com algo funcionando. A ordem ataca o risco cedo: a Alexa é testada logo que o ESP32 chega, e o mecanismo é testado com ração de verdade antes da estrutura final.

As horas são estimativas de esforço para quem está começando, não prazos. Total: ~55–90 h aqui, mais ~55–90 h no [roteiro do sistema](ROTEIRO-SISTEMA.md).

**O que roda em paralelo:** o roteiro do sistema roda inteiro no PC, sem nenhuma peça, em paralelo a tudo. Enquanto o AliExpress não chega, dá para fazer o M1 no simulador, o M2 com o ESP32 do Mercado Livre e o M5 inteiro no PC. O M4 pode começar assim que o kit impresso chegar, junto com o M3.

### M0 — Compras e ambiente · 2–4 h

**Objetivo:** ter o firmware rodando no simulador e na placa.

- [ ] Fazer os pedidos do Mercado Livre (seção 4.1) e do AliExpress (4.2).
- [ ] Instalar VS Code + extensão PlatformIO + extensão Wokwi (ativar a licença gratuita).
- [ ] Criar o projeto com os ambientes `esp32dev`, `wokwi` e `native` (seção 6).
- [ ] Montar o `diagram.json` com o ESP32 e um LED, e o `wokwi.toml` apontando para o firmware compilado.
- [ ] Rodar o "blink" no simulador.
- [x] Quando a placa chegar: instalar o driver USB (CP2102 ou CH340, está escrito no chip perto do conector) e gravar o mesmo blink no LED da placa (GPIO 2).

**Pronto quando:** o LED pisca com código seu no Wokwi e na placa, e o `Serial.println` aparece no monitor.

**Armadilhas:**
- Cabo USB que só carrega: a placa acende mas o PC não a enxerga.
- Algumas placas pedem segurar o botão `BOOT` no início da gravação.

### M1 — Fundamentos · 4–8 h

**Objetivo:** entender o básico de eletrônica e do loop sem travar.

- [ ] Lei de Ohm na prática: calcular o resistor de um LED (3,3 V, ~10 mA).
- [x] LED externo com resistor e botão com `INPUT_PULLUP` e tratamento de bounce.
- [ ] No Wokwi: servo indo de 0° a 60° e voltando quando o botão é apertado.
- [x] Reescrever tudo **sem `delay()`**: `millis()` + máquina de estados.
- [ ] Na protoboard real: LED e botão. Com o multímetro, medir os 5 V e os 3,3 V da placa.

**Pronto quando:** o botão move o servo no simulador e o LED pisca ao mesmo tempo, sem um travar o outro.

**O conceito-chave:** o `loop()` do Arduino é como o event loop do Node. Um `delay(1000)` é um `while` bloqueante de 1 s: nada mais acontece. Toda tarefa vira "já está na hora de fazer X?".

### M2 — Teste da Alexa (risco nº 1) · 3–6 h

Precisa da placa real; o Wokwi não serve aqui.

**Objetivo:** provar que o Echo Dot enxerga o ESP32 antes de construir em cima disso.

- [x] Conectar o ESP32 ao Wi-Fi com a senha em `include/secrets.h` (no `.gitignore`).
- [x] Criar um dispositivo Espalexa chamado "alimentador".
- [x] "Alexa, descobrir dispositivos" e depois "Alexa, liga o alimentador" acendendo o LED.
- [x] Depois de agir, voltar o estado do dispositivo para "desligado", para o próximo "liga" funcionar.
- [x] Testar também pelo app da Alexa no celular, fora do Wi-Fi de casa (4G). Se funcionar, é um jeito extra de servir de longe.

**Pronto quando:** o comando de voz acende o LED 10 vezes seguidas sem falhar.

**Se falhar:** confira se o Echo e o ESP32 estão na mesma rede de 2,4 GHz (o ESP32 não usa 5 GHz). Se mesmo assim o Echo não descobrir, troque para **Sinric Pro** agora (o ESP32 conecta para fora e funciona com qualquer Echo).

### M3 — Servo na bancada · 4–6 h

**Objetivo:** o servo indo e voltando cem vezes sem derrubar o ESP32.

- [ ] Montar a fonte no borne e ligar servo, VIN, GND e capacitor (seção 3.4). Conferir a polaridade com o multímetro **antes** de ligar o ESP32.
- [ ] `attach(18, 500, 2400)`, mover de 0° a 60° em passos pequenos com `millis()` e dar `detach()` ao parar.
- [ ] Descobrir os ângulos reais: o braço não encaixa exatamente no zero. Anotar `anguloEncher` e `anguloServir`.
- [ ] Escrever `servir(n)` com a máquina de estados da seção 3.3, sem bloquear o loop.
- [ ] Rodar 100 ciclos seguidos olhando o Serial Monitor.
- [ ] Medir com o multímetro, com o servo forçando contra a mão por 1 s: borne em pelo menos 4,5 V e pino 3V3 em pelo menos 3,2 V (seção 3.4.1). Anotar também a tensão da fonte em vazio.
- [ ] Ajustar a velocidade: rápido o bastante para soltar a ração, devagar o bastante para não assustar o gato.

**No simulador antes:** a máquina de estados e o `servir(n)` inteiros. **Só na placa:** alimentação, reinício, ângulos reais e barulho.

**Pronto quando:** 100 ciclos sem o ESP32 reiniciar e com o servo parando sempre nos mesmos ângulos.

**Armadilhas:**
- Se o Serial mostrar `Brownout detector was triggered` ou o ESP32 reiniciar quando o servo arranca: confira a fonte de 3 A, o capacitor e o GND comum.
- Servo zumbindo ou tremendo parado: falta o `detach()`.
- Servo que gira sem parar: é a versão de 360°. Não tem conserto, troque.
- Para gravar com a fonte ligada no borne e o USB no PC ao mesmo tempo, mande antes uma foto da placa para o Claude conferir se ela tem o diodo que separa o USB do VIN. Na dúvida, desligue a fonte para gravar.

### M4 — Kit de teste impresso · 6–10 h + espera da impressão

Pode rodar em paralelo ao M3.

**Objetivo:** validar o mecanismo com ração de verdade antes de imprimir a estrutura.

- [ ] Escolher a garrafa e medir: diâmetro do corpo, altura em que o ombro passa de Ø 54 mm e altura total. Mandar as medidas para o Claude.
- [ ] Cortar o gargalo nessa altura e o fundo da garrafa. Lixar as bordas.
- [ ] Claude escreve o OpenSCAD do kit: garganta (nas medidas da sua garrafa), comporta + reserva, cubo do braço do servo, mesa, bico, coluna e um **cupom de encaixe** (folgas de 0,3, 0,5 e 0,7 mm e o rebaixo do braço redondo do servo), seguindo as regras da seção 5.1.
- [ ] Você revisa os parâmetros e manda imprimir (230–300 g, em PETG natural nas peças da ração).
- [ ] Prender a coluna numa tábua com dois parafusos ou com um grampo na mesa. A base definitiva fica para o M9.
- [ ] Montar servo, cubo, mesa, comporta, garganta, bico e garrafa.
- [ ] **Calibrar:** soltar 20 porções na balança de cozinha e dividir. Esse é o `gramasPorPorcao`.
- [ ] Servir 50 porções com a ração do seu gato, com a garrafa cheia e com ela quase vazia, pesando a cada 10.
- [ ] Prender um grão de propósito na borda da garganta: o servo corta, empurra ou trava?
- [ ] O bolso esvazia inteiro em 60°? Se sobrar ração, aumentar as sacudidas ou o furo de saída.
- [ ] A ração forma "ponte" na garganta?
- [ ] O bico joga a ração dentro da tigela, sem espalhar?
- [ ] Desmontar, lavar e remontar garganta, comporta, mesa e bico sem ferramenta. Meta: menos de 2 minutos.
- [ ] Ajustar os parâmetros e reimprimir o que precisar.

**Pronto quando:** 50 porções seguidas sem travar, com variação de peso de até ±15%, e o mecanismo sai para lavar e volta sem ferramenta.

### M5 — Núcleo do firmware e sensores · 16–24 h

A lógica roda inteira no PC e no simulador; só os sensores precisam das peças.

**Objetivo:** o cérebro do dispenser, testado, com as regras de segurança.

- [ ] Criar `lib/core/scheduler`: dado "agora" e a lista de horários, qual refeição deve sair, sem sair duas vezes no mesmo minuto.
- [ ] No mesmo módulo, a **refeição perdida**: dada a hora da última refeição servida e a agenda, existe uma refeição das últimas 2 h que não saiu?
- [ ] Criar `lib/core/guard`: dado o histórico do dia e o peso da tigela, aceitar ou recusar um pedido (limite diário, intervalo mínimo, tigela com ração), com o motivo.
- [ ] Criar `lib/core/level`: dada a distância medida e a altura da garrafa, a porcentagem e quantos dias faltam pela agenda.
- [ ] Se a E7 do roteiro do sistema já estiver pronta, os testes do `DispositivoSimulado` (em TS) servem de lista para o `guard`.
- [ ] Escrever testes Unity e rodar com `pio test -e native`:
  - a virada da meia-noite zera o contador do dia;
  - a refeição das 07:30 sai uma vez só, mesmo com o loop rodando várias vezes no mesmo minuto;
  - um pedido manual 10 min depois de outro é recusado com intervalo mínimo de 30 min;
  - uma refeição agendada que bateria o limite diário é recusada e registrada;
  - depois de 40 min sem energia, a refeição perdida sai uma vez; depois de 3 h, não sai;
  - com 100 g na garrafa e 60 g por dia na agenda, faltam menos de 2 dias;
  - uma refeição agendada com 12 g na tigela é adiada e, depois de 2 h sem esvaziar, é pulada;
  - com a balança sem leitura, a agenda continua só com os limites.
- [ ] Ligar o HX711 em 3,3 V e a célula de carga: tara com a tigela vazia, calibração com um peso conhecido (um pacote fechado de 500 g serve), média das leituras e detecção de "parado".
- [ ] Ligar o VL53L1X no I²C e medir a garrafa vazia, pela metade e cheia, para calibrar a porcentagem.
- [ ] Confirmar cada porção pela balança e entrar em `VAZIO` quando o peso não subir.
- [ ] Hora pelo NTP com `configTzTime`, e um "a hora é válida?" que pausa a agenda enquanto for falso.
- [ ] Configuração, tara e fator da balança e hora da última refeição na NVS com `Preferences`.
- [ ] Histórico em JSON Lines no LittleFS, com limite de linhas.
- [ ] `requestDispense(porcoes, origem)` como única porta de entrada; agenda e Alexa passam por ela.
- [ ] LED da placa: aceso enquanto serve, piscando devagar sem Wi-Fi ou sem hora.

**Pronto quando:** os testes passam no PC e, na placa, uma agenda de 3 refeições em minutos próximos roda sozinha. Desligando 10 min e religando, a refeição perdida sai uma vez. Com ração na tigela, o pedido é recusado; com a garrafa vazia, a porção vira `VAZIO` e avisa.

### M6 — Wi-Fi e conversa com o servidor · 8–12 h

Depende da E9 do roteiro do sistema: é lá que o protocolo MQTT fica fechado.

**Objetivo:** o ESP32 configurado sem senha no código e conversando com o servidor.

- [ ] Trocar o `secrets.h` pela WiFiManager: sem rede salva, o ESP32 cria a rede "Alimentador-Setup". No ambiente `wokwi`, pular essa etapa.
- [ ] No portal da WiFiManager, campos extras para o endereço, o usuário e a senha do broker MQTT, salvos na NVS.
- [ ] Rodar a WiFiManager **antes** de subir o servidor do Espalexa.
- [ ] Cliente MQTT seguindo o `docs/protocolo-mqtt.md`: aplicar a configuração retida e devolver a versão no estado, receber comandos, publicar eventos com `seq` e o estado, e registrar o last will.
- [ ] O comando `servir` do MQTT passa pelo `requestDispense`, como a agenda e a Alexa.
- [ ] Ao reconectar, reenviar os eventos do histórico local que vieram depois do `ultimoSeq` informado pelo servidor.
- [ ] Testar com o servidor de verdade: o "ESP32 de mentira" sai, a placa entra, e o servidor não muda.

**Pronto quando:** a placa aparece online no PWA, recebe a agenda alterada pelo celular e manda o histórico. Com o servidor desligado, a agenda continua, e o histórico se completa quando ele volta. A Alexa continua funcionando.

### M7 — Interface web

Desde 30/10/2026, a interface é um PWA servido pelo servidor Fastify, com HTTPS. As telas, os testes e a instalação no celular estão nas etapas **E10 e E11** do [roteiro do sistema](ROTEIRO-SISTEMA.md). A limitação antiga (sem HTTPS, sem service worker) deixou de existir.

### M8 — Avisos e comandos de fora de casa (Telegram) · 4–8 h

**Talvez não entre.** Se a notificação push do PWA (E12 do roteiro) funcionar no seu celular, os avisos ficam no servidor, o "servir" de fora de casa é o próprio PWA, e este marco sai do plano. Decidir na E12.

**Objetivo:** saber de longe que o gato comeu, e servir se precisar.

- [ ] Criar o bot no @BotFather e guardar o token pela tela de Ajustes (na NVS, nunca no git).
- [ ] Responder **só ao seu `chat_id`**; qualquer outra conversa é ignorada.
- [ ] Comandos: `/status`, com o peso da tigela e o nível, e `/servir`, que passa pelo `requestDispense` com os mesmos limites e sem "servir mesmo assim".
- [ ] Avisos: garrafa abaixo de 20%, porção que não saiu (`VAZIO`), refeição pulada porque a tigela ficou com ração por 2 h, sensor sem leitura, o ESP32 reiniciou (queda de luz) e ficou sem hora.
- [ ] Consultar o Telegram a cada 5–10 s sem travar o loop. Se o Wi-Fi cair, tentar de novo depois, sem travar a agenda.

**Pronto quando:** pelo 4G, `/servir` solta uma porção respeitando os limites, e o aviso de ração acabando chega no celular.

### M9 — Revestimento e 7 dias com o gato · 8–14 h + espera da impressão

**Objetivo:** sair da bancada e entrar na rotina da casa, sem fio nem peça móvel ao alcance do gato.

- [ ] Medir a tigela de inox (diâmetro da base e da borda, altura).
- [ ] Claude modela o revestimento: pedestal (2 metades + fundo), prato da balança com batentes, capa da torre (2 metades, frente removível), coluna da tampa e tampa articulada com o encaixe do sensor de nível.
- [ ] Pedir orçamento por peso e imprimir (600–800 g; PLA serve, porque nada disso toca a ração).
- [ ] Montar a eletrônica no pedestal: ESP32, mini protoboard, HX711, borne e capacitor. Uma gota de cola quente em cada jumper para ele não soltar com a vibração.
- [ ] Montar a célula de carga no apoio e o prato em cima, conferindo a folga de 2 mm em volta. Regular os batentes com ~5 kg no prato até encostarem (seção 5.2). Refazer a tara e a calibração.
- [ ] Encostar o dispenser na parede e prender a coluna da tampa com a cantoneira (ou parafusar o pedestal na base de MDF).
- [ ] Passar os cabos do servo e do sensor de nível por dentro da coluna e da coluna da tampa. Nenhum fio pode aparecer por fora.
- [ ] Passar o cabo da fonte pelo protetor espiral, rente ao chão e, se der, atrás de um móvel.
- [ ] **Teste de tombamento:** com a garrafa cheia, empurrar o conjunto pela lateral e pela frente. Não pode tombar.
- [ ] Lavar as peças que tocam a ração antes do primeiro uso e combinar a rotina de limpeza da seção 5.1 com quem mora com você.

**Pronto quando:** roda **7 dias seguidos com o gato**, sem intervenção, e o histórico bate com o que você observou.

### M10 — Portfólio · 4–8 h

**Objetivo:** contar a história do projeto.

- [ ] Criar o repositório público (seção 10).
- [ ] README com fotos, vídeo curto, diagrama de arquitetura e esquema de ligação.
- [ ] Dar o crédito da estrutura ao tutorial da MakerHero e explicar o que mudou (dose por volume, gargalo cortado, servo, bico fixo, eletrônica fechada).
- [ ] Documentar as decisões (seção 2) e o que deu errado no caminho, incluindo as duas ideias anteriores (rotor e gaveta).
- [ ] Conferir que nenhuma senha, token ou IP da sua casa foi para o git.
- [ ] Opcional: GitHub Actions compilando o firmware e o front, e rodando os testes `native`.

**Pronto quando:** alguém de fora consegue entender e reproduzir o projeto pelo README.

---

## 8. Riscos

| Risco | Chance | Impacto | Como vamos saber | Plano B |
|---|---|---|---|---|
| Echo Dot não descobrir o Espalexa | Média | Alto | M2 | Sinric Pro |
| Grão preso entre a comporta e a garganta ou a mesa | Média | Alto | M4 | Chanfrar a borda do furo, ajustar folgas, borda fina na comporta; o MG996R tem força para cortar |
| Bolso não esvaziar todo em 60° | Média | Médio | M4 | Furo de saída maior, mais sacudidas, bolso levemente cônico |
| ESP32 reiniciando quando o servo arranca | Média | Médio | M3 | Fonte de 3 A, capacitor, GND comum no borne, `detach()` |
| Comprar o servo de 360° por engano | Média | Médio | Na compra / M3 | Conferir "180°" no anúncio; o segundo servo é reserva |
| Conjunto tombar (46 cm, garrafa cheia no alto) | **Alta**: tomba com ~3 N de lado (seção 5.2) | Alto | M9 | Cantoneira na parede; sem furar, base de MDF de 40 × 30 cm. Lastro e pés na borda ajudam pouco |
| Gato mexer no bico pela fenda da capa | Baixa | Baixo | M9 | Fenda mais estreita ou uma aba na frente dela |
| Balança instável (gato apoiando, temperatura) | Média | Médio | M5 / M9 | Só confiar em leitura parada, tara periódica com a tigela vazia, batentes contra sobrecarga |
| Leitura do nível errada com a garrafa quase vazia | Média | Baixo | M5 | Estreitar o feixe (`setROISize`); a balança confirma quando acabou de verdade |
| Revestimento estourar o orçamento | Alta | Médio | Orçamento da impressão | PLA, paredes finas, imprimir o revestimento por último (seção 4.5) |
| Garrafa com medidas diferentes do modelo | Alta | Baixo | M4 | A garganta é paramétrica: mede e ajusta |
| Ração formando "ponte" na garganta | Baixa | Médio | M4 | Cortar o gargalo mais acima (saída maior), paredes mais inclinadas |
| Ficar sem hora (luz volta, internet não) | Baixa | Médio | M5 | A agenda espera e a refeição perdida em até 2 h sai; se acontecer muito, o RTC DS3231 entra com 4 fios |
| Barulho do servo assustar o gato | Média | Baixo | M3 / M9 | Movimento mais lento e acostumar o gato aos poucos |
| WiFiManager conflitar com o AsyncWebServer | Média | Baixo | M6 | ESPAsyncWiFiManager |
| Servidor fora do ar (PC desligado, deploy quebrado) | Média | Baixo | E9 / M6 | O ESP32 segue a última configuração e reenvia o histórico quando o servidor volta. Só os avisos param |
| ESP32 sem achar o broker depois de trocar o roteador | Média | Médio | M6 | IP reservado para a máquina do servidor; endereço do broker editável no portal da WiFiManager |
| PETG acumulando resíduo | Média | Médio | Uso | PETG natural removível, comporta reserva, lavagem semanal; garrafa trocada quando encardir |

---

## 9. Fora da v1 (backlog)

Cada item entra só se o uso mostrar que faz falta.

- **Relógio RTC DS3231:** hora sem internet depois de uma queda de luz.
- **Gráfico de quanto o gato comeu por dia**, com os dados da balança, que já ficam no MongoDB.
- **Bateria de backup.**
- **Botão físico** para servir e para reconhecer alertas.
- **Home Assistant**, que se conecta ao broker MQTT que já existe.
- **App nativo** (React Native/Expo) consumindo a mesma API `/v1`.

---

## 10. Estrutura do repositório (M10)

```
dispenser/
├── README.md
├── docker-compose.yml  # MongoDB e Mosquitto (roteiro do sistema)
├── firmware/      # PlatformIO (seção 3.7), com wokwi.toml e diagram.json
├── server/        # Fastify + DDD (roteiro do sistema)
├── web/           # PWA React + Vite + TS; o build é servido pelo server
├── contratos/     # schemas Zod da API, usados pelo server e pelo web
├── cad/           # OpenSCAD paramétrico + STLs exportados
│   ├── params.scad      # medidas da garrafa, folgas, ângulos
│   ├── kit-teste.scad   # garganta, comporta, cubo, mesa, bico, coluna, cupom
│   └── revestimento.scad # pedestal, prato, capa, coluna da tampa, tampa
└── docs/          # arquitetura, esquema de ligação, fotos, decisões
```

---

## 11. Como trabalhar com o Claude neste projeto

- **Firmware e eletrônica:** peça a explicação do conceito e uma revisão do que você escreveu. Por combinação, o Claude não entrega o firmware pronto.
- **Simulador:** mande o `diagram.json` e o que aparece no Wokwi; o Claude ajuda a montar o circuito e a interpretar.
- **CAD:** peça o OpenSCAD do marco atual ("faz o kit de teste do M4" + as medidas da garrafa), revise os parâmetros e mande imprimir.
- **Servidor e interface:** mentoria com TDD, etapa por etapa, como explica a seção 4 do [roteiro do sistema](ROTEIRO-SISTEMA.md).
- **Quando travar:** mande o código, uma foto da montagem e a saída do Serial Monitor juntos. É bem mais rápido de diagnosticar.

---

## 12. Definição de pronto da v1

- [ ] Serve as refeições agendadas no horário, e serve a refeição perdida depois de uma queda de luz curta.
- [ ] Cada porção pesa o mesmo dentro de ±15%, com a garrafa cheia ou quase vazia.
- [ ] Recusa porções acima do limite diário ou antes do intervalo mínimo, venha o pedido de onde vier.
- [ ] Não serve com ração na tigela, e avisa quando uma porção não saiu.
- [ ] Avisa no celular quando a garrafa está abaixo de 20%.
- [ ] "Alexa, liga o alimentador" e o "servir agora" do PWA soltam uma porção, respeitando os limites.
- [ ] PWA instalado no celular, funcionando de fora de casa, com agenda, servir agora, status, nível, histórico, calibração e limites.
- [ ] Com o servidor fora do ar, o alimentador continua servindo pela agenda, e o histórico se completa quando ele volta.
- [ ] Configuração de Wi-Fi pelo portal, sem senha nem token no código.
- [ ] Garganta, comporta, mesa, bico e tigela saem para lavar sem ferramenta.
- [ ] Não tomba com a garrafa cheia, e nenhum fio ou peça móvel fica ao alcance do gato.
- [ ] 7 dias seguidos de uso real com o gato.
- [ ] Repositório público documentado.

---

## 13. Histórico de mudanças

| Data | Mudança |
|---|---|
| 29/10/2026 | Escopo inicial fechado (grill do projeto), com rotor, motor de passo e sensores. |
| 29/10/2026 | Simplificação: a primeira versão foi considerada complexa demais para um projeto pessoal. Foram estudadas a gaveta dosadora (modelo 2) e a estrutura de garrafa do vídeo da MakerHero (modelo 3). |
| 29/10/2026 | Plano reescrito para o protótipo 3: garrafa PET, comporta dosadora com servo MG996R, sem sensores, sem RTC, sem solda; Telegram para avisos de fora de casa; trilha do simulador Wokwi. A versão anterior foi para `arquivo/`. |
| 29/10/2026 | Versão revestida: capa estilo cafeteira, pedestal com a eletrônica, tigela a ~10 cm do chão, sem fio exposto (cabo de 5 V num protetor espiral). Segurança com balança na tigela (HX711) e sensor de nível na tampa (VL53L1X). Comporta passa a girar 60°. Lista de compras e custos atualizados. |
| 29/10/2026 | Nova seção 4.6 com os links de compra de cada item, o preço visto e o que conferir no anúncio, e a ordem de compra sugerida. |
| 30/10/2026 | Entra um servidor Fastify + MongoDB com DDD (D18), como companheiro do ESP32, que continua decidindo sozinho. Conversa por MQTT (D19). O PWA sai do LittleFS e passa a ser servido pelo servidor, com HTTPS (D11); a API `/v1` também vai para o servidor. Avisos por notificação push, com o Telegram em espera (D13, M8). M6 reescrito e M7 movido para o novo [roteiro do sistema](ROTEIRO-SISTEMA.md). |
| 12/11/2026 | O servidor e o PWA ficaram prontos (etapas E0 a E10 do roteiro; E11 a E13 dependem de passos no celular e na rede). O broker MQTT passou a rodar dentro do servidor (D19), o contrato com o firmware está em [protocolo-mqtt.md](protocolo-mqtt.md), e a biblioteca MQTT sugerida para o firmware mudou para uma que publica em QoS 1. Para instalar e usar, veja o [guia](GUIA.md). |
| 04/11/2026 | Nova seção 3.4.1 com o cálculo de tensão e corrente do modelo de garrafa: consumo de cada peça, calor no regulador, queda nos fios, capacitor e gasto de energia. Medição de tensão acrescentada ao M3. |
| 04/11/2026 | Nova seção 5.2 com o cálculo mecânico: estresse na coluna e no braço, flexão, servo contra grão preso, célula de carga e tombamento. Folga garganta–comporta passa a 1 mm, batentes da balança reguláveis, e entram a cantoneira na parede e o risco de tombar como Alto. |
| 04/11/2026 | Análise de elementos finitos da comporta (seção 5.2, itens 7 e 8): segurança de ~54× com o servo travado; espessura mínima limitada pelo grão (1,2 × a maior medida, 10 mm para grão de 8 mm). |
