# Protocolo MQTT — servidor ↔ ESP32

> O contrato entre o servidor e o alimentador. O firmware (marco M6 do [plano](PLANO-DE-ACAO.md)) precisa seguir este documento.
> A fonte da verdade é o código: [`server/src/infra/mqtt/protocol.ts`](../server/src/infra/mqtt/protocol.ts). O "ESP32 de mentira" ([`server/src/simulator/mqtt-simulator.ts`](../server/src/simulator/mqtt-simulator.ts)) é uma implementação completa do lado do dispositivo e serve de referência.

## Conexão

| Item | Valor |
|---|---|
| Broker | A máquina do servidor, porta `MQTT_BROKER_PORT` (padrão 1883) |
| Usuário e senha | `MQTT_USERNAME` e `MQTT_PASSWORD` do `.env` do servidor |
| Client id do dispositivo | Qualquer um que não seja o do servidor. Sugestão: `alimentador-<id>` |
| Client id do servidor | `servidor-<id>` |
| `<id>` | O `FEEDER_ID` do `.env` (padrão `principal`) |
| Last will do dispositivo | Tópico `online`, mensagem `0`, QoS 1, retida |

Quem abre a conexão é sempre o ESP32. O servidor nunca procura o dispositivo.

## Tópicos

Todos começam com `alimentador/<id>/`.

| Tópico | Sentido | QoS | Retida | Conteúdo |
|---|---|---|---|---|
| `config` | servidor → ESP32 | 1 | sim | A configuração e a agenda completas |
| `sync` | servidor → ESP32 | 1 | sim | O último evento que o servidor já tem |
| `cmd` | servidor → ESP32 | 1 | não | Um comando |
| `cmd/resp` | ESP32 → servidor | 1 | não | A resposta de um comando |
| `evento` | ESP32 → servidor | 1 | não | Um fato que aconteceu |
| `estado` | ESP32 → servidor | 0 | sim | A "foto" atual do dispositivo |
| `online` | ESP32 → servidor | 1 | sim | `1` ou `0` |

## O que o dispositivo faz

**Ao conectar:**
1. Publica `1` em `online`, retida.
2. Assina `config`, `sync` e `cmd`.
3. Publica o `estado`.

**Ao receber `config`:** aplica, guarda na memória permanente (NVS) e passa a informar a `versao` recebida no campo `configVersao` do `estado`. É assim que o app sabe se a configuração está "sincronizada" ou "pendente".

**Ao receber `sync`:** reenvia todos os eventos guardados com `seq` maior que o `ultimoSeq` informado. Se o `ultimoSeq` for maior que o contador local (por exemplo, depois de regravar o firmware), o contador pula para ele.

**Ao receber `cmd`:** executa e responde em `cmd/resp` com o mesmo `id`. O servidor espera **5 segundos**; sem resposta, considera o dispositivo offline e devolve 503 ao app.

**Sempre que algo acontece:** publica um `evento` e guarda uma cópia local (o histórico no LittleFS), para reenviar se o servidor pedir.

**Sempre que o estado muda:** publica o `estado`, retido. Publicar de novo a cada minuto, mesmo sem mudança, não faz mal.

**Sem conexão:** continua servindo pela agenda, com a última configuração guardada. Os eventos ficam no histórico local e seguem depois, no `sync`.

## Regras importantes

- **O `seq` nunca volta atrás.** É um contador inteiro, começa em 1, sobe de 1 em 1 e fica guardado na NVS. O servidor ignora um `seq` que já recebeu, então reenviar é sempre seguro.
- **Publique os eventos em QoS 1.** A biblioteca PubSubClient só publica em QoS 0. Com ela, um evento pode se perder no meio de uma conexão e só voltar no próximo `sync`. Prefira uma biblioteca que publique em QoS 1, como a `espMqttClient` ou o cliente MQTT do próprio ESP-IDF.
- **Todo pedido de porção passa pelas mesmas regras** (limite diário, intervalo mínimo e tigela), venha da agenda, do `cmd` ou da Alexa. O `forcar` só ignora a tigela.
- **A hora vai em ISO 8601 com fuso**, de preferência em UTC: `2026-11-12T10:30:00.000Z`. Sem hora válida (logo depois de ligar, sem internet), guarde o evento e envie quando a hora voltar.

## Mensagens

### `config`

```json
{
  "versao": 7,
  "config": {
    "gramasPorPorcao": 6,
    "limiteDiarioPorcoes": 10,
    "intervaloMinimoMin": 30,
    "limiteTigelaGramas": 10,
    "fusoHorario": "America/Sao_Paulo",
    "fusoPosix": "<-03>3",
    "alturaGarrafaMm": 230,
    "anguloEncher": 0,
    "anguloServir": 60
  },
  "agenda": [
    { "hora": "07:30", "porcoes": 2, "ativo": true },
    { "hora": "18:00", "porcoes": 3, "ativo": true }
  ]
}
```

- A agenda vem em ordem de horário, com no máximo 8 itens.
- O `fusoPosix` é o que o `configTzTime` do ESP32 espera.
- O servidor já validou tudo: a soma das porções ativas cabe no limite diário, e as refeições ativas respeitam o intervalo mínimo.
- Com 8 refeições, a mensagem tem cerca de 600 bytes. Confira o tamanho do buffer da biblioteca MQTT: o padrão de algumas é 256 bytes.

### `sync`

```json
{ "ultimoSeq": 41 }
```

### `cmd`

Todo comando tem um `id` (texto) e um `tipo`.

| `tipo` | Campos a mais | O que faz |
|---|---|---|
| `servir` | `porcoes` (inteiro), `forcar` (booleano), `origem` | Pede porções agora |
| `tara` | — | Zera a balança com a tigela vazia |
| `calibrar_balanca` | `gramas` | Calibra com um peso conhecido no prato |
| `calibrar_dose` | `porcoes` | Solta porções para pesar. Não conta no limite diário |
| `testar_servo` | `angulo` (0 a 180) | Move o servo até o ângulo |
| `reconhecer_alerta` | — | Sai do estado `vazio` |

```json
{ "id": "5f0c…", "tipo": "servir", "porcoes": 1, "forcar": false, "origem": "interface" }
```

### `cmd/resp`

```json
{ "id": "5f0c…", "resultado": "recusado", "motivo": "tigela_com_racao" }
```

| `resultado` | Quando | O app recebe |
|---|---|---|
| `aceito` | O comando vai ser executado | 202 (servir) ou 200 |
| `recusado` | Uma regra barrou. Vem com o `motivo`: `limite_diario`, `intervalo` ou `tigela_com_racao` | 429 |
| `ocupado` | Está servindo, ou está em `vazio` | 409 |

### `evento`

```json
{
  "seq": 42,
  "tipo": "refeicao_servida",
  "hora": "2026-11-12T10:30:00.000Z",
  "porcoes": 2,
  "gramas": 12.4,
  "origem": "agenda"
}
```

`seq`, `tipo` e `hora` são obrigatórios. Os outros campos dependem do tipo:

| `tipo` | Quando | Campos |
|---|---|---|
| `refeicao_servida` | As porções saíram, e a balança confirmou | `porcoes`, `gramas`, `origem` |
| `refeicao_recusada` | Um pedido foi barrado por uma regra | `porcoes`, `origem`, `motivo` |
| `refeicao_adiada` | Refeição da agenda com ração na tigela. Tenta de novo a cada 20 min | `porcoes`, `origem`, `motivo` |
| `refeicao_pulada` | Depois de 2 h adiando, desistiu | `porcoes` |
| `garrafa_vazia` | O servo girou e o peso não subiu. Entra no estado `vazio` | `porcoes`, `origem` |
| `sensor_sem_leitura` | Um sensor parou de responder | `motivo`: `balanca` ou `nivel` |
| `reiniciou` | O dispositivo ligou | — |

A `origem` é `agenda`, `interface` ou `alexa`.

### `estado`

```json
{
  "hora": "2026-11-12T10:30:05.000Z",
  "horaValida": true,
  "estado": "ocioso",
  "tigela": { "gramas": 12.4, "estavel": true },
  "garrafa": { "percentual": 63, "diasRestantes": 9 },
  "sensores": { "balanca": true, "nivel": true },
  "configVersao": 7,
  "rssi": -58
}
```

- `estado`: `ocioso`, `servindo` ou `vazio`.
- `tigela.gramas` e os dois campos da `garrafa` são `null` quando o sensor não tem leitura.
- O `rssi` é opcional.

O servidor abre e fecha os alertas a partir daqui: garrafa abaixo de 20%, sensor sem leitura e saída do estado `vazio`.

### `online`

`1` quando conecta, `0` quando sai. Se o dispositivo cair sem avisar, o broker publica o `0` por ele (last will). Depois de 30 minutos em `0`, o servidor abre o alerta de alimentador offline.

## Como testar o firmware contra o servidor

1. Suba o servidor com o broker (seção 3 do [guia](GUIA.md)).
2. Rode `pnpm simulador` em `server/` e observe a conversa no log: é o comportamento esperado.
3. Pare o simulador, ligue a placa com o mesmo `FEEDER_ID` e confira no app: deve aparecer "Online" e "Configuração sincronizada".
4. Os testes em [`mqtt.integration.test.ts`](../server/src/infra/mqtt/mqtt.integration.test.ts) descrevem os casos que o firmware precisa cobrir: receber a configuração retida, responder ao servir, cair sem avisar e completar o histórico depois que o servidor volta.
