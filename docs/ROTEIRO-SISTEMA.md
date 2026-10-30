# Dispenser de Ração — Roteiro do Sistema (servidor + PWA)

> Trilha guiada do software que roda fora do ESP32: servidor Fastify com DDD, MongoDB, conversa com o ESP32 por MQTT e PWA instalado no celular.
> Complementa o [PLANO-DE-ACAO.md](PLANO-DE-ACAO.md). Começada em 30/10/2026.
> **Formato:** mentoria com TDD. Você escreve os testes e o código; o Claude explica o conceito, define o que testar e revisa.

---

## 1. Para que serve o servidor, e o que ele não faz

O plano original não tinha servidor: toda a regra ficava no ESP32. O servidor entra para três coisas:

1. **Aprender** backend com Fastify, DDD e TDD num domínio pequeno e real.
2. **Guardar e mostrar:** configuração, histórico longo, estatísticas e avisos.
3. **Levar o alimentador para o celular:** PWA instalável de verdade (com HTTPS), dentro e fora de casa.

E uma coisa ele **não** faz: decidir se o gato come. A agenda, o limite diário, o intervalo mínimo e a conferência da tigela continuam no ESP32. Com o servidor fora do ar, o ESP32 segue a última configuração recebida, guarda o histórico e reenvia tudo quando o servidor volta.

| Quem | Garante |
|---|---|
| Servidor | Que a **configuração** é válida antes de chegar ao ESP32. Exemplo: a agenda não pode planejar mais porções do que o limite diário |
| ESP32 | Que **cada porção** respeita os limites na hora de servir, venha o pedido de onde vier |

---

## 2. Decisões

| # | Decisão | Escolha | Por quê |
|---|---|---|---|
| S1 | Papel do servidor | Companheiro do ESP32, que continua autônomo | Com o servidor ou a internet fora do ar, o gato come |
| S2 | Backend | Node 24 + TypeScript `strict` + Fastify | Escolha sua; o Node 24 já está instalado |
| S3 | Arquitetura | DDD tático leve, com portas e adaptadores. Sem CQRS, event sourcing ou barramento de mensagens | O domínio é pequeno. A ideia é aprender os blocos básicos (value object, agregado, repositório, caso de uso) sem cerimônia |
| S4 | Banco | MongoDB com o driver oficial, sem Mongoose | Os dados são documentos (configuração, agenda, eventos). Sem Mongoose, a tradução entre entidade e documento fica explícita no repositório, e não sobram dois "modelos" competindo. O Redis fica de fora: é ótimo para cache e fila, mas fraco como banco principal |
| S5 | Testes | Vitest, com TDD. Rotas testadas com `app.inject()`; repositórios com uma suíte de contrato que roda contra a versão em memória e a do Mongo | Teste rápido, sem abrir porta e sem mock de biblioteca |
| S6 | Validação | Zod na borda HTTP, para a **forma** do dado (400). Regras no domínio, para o **sentido** do dado (422) | Cada camada valida o que é dela |
| S7 | Conversa com o ESP32 | MQTT com Mosquitto, e o ESP32 é quem abre a conexão. Confirmar na E9 | Configuração retida no broker, aviso de "offline" de graça (last will) e entrega garantida dos eventos (QoS 1). Funciona com o servidor em casa ou na nuvem |
| S8 | Interface | PWA em React + Vite + TS, com `vite-plugin-pwa`. Em produção, servido pelo próprio Fastify | Mesma origem da API, então não precisa de CORS |
| S9 | Linguagem do código | Termos do domínio em português, iguais aos do plano (Alimentador, Refeição, Porção, Horário, Tigela); termos técnicos em inglês (repository, mapper, handler) | Linguagem ubíqua: o código fala como o plano |
| S10 | Pacotes | pnpm | Já está instalado |
| S11 | HTTPS e onde o servidor roda | Decidir na E11 e na E13. Recomendação: em casa, com Tailscale | Detalhes nas etapas |

---

## 3. Arquitetura

```
                     ┌───────────────── Servidor ─────────────────┐
  Celular (PWA) ────►│ http/         rotas /v1, Zod, erro → status │
  HTTPS              │ application/  casos de uso + portas         │
                     │ domain/       Alimentador, Horario, …       │
                     │ infra/        Mongo, memória, MQTT, push    │
                     └───────┬───────────────────────┬────────────┘
                             │                       │
                          MongoDB             Mosquitto (MQTT)
                                                     ▲
                                                     │ o ESP32 abre a conexão
                                      ESP32: agenda + limites + tigela
                                      (decide sozinho)
```

**Regra de dependência:** os `import` só apontam para dentro.

```
http  ──► application ──► domain
infra ──► application     (implementa as portas)
infra ──► domain
domain ─► nada
```

**Pastas** (o sistema fica num repositório próprio, separado desta pasta de planejamento):

```
<repositório do sistema>/
├── docker-compose.yml       # mongo (E6) e mosquitto (E9)
├── docs/                    # glossário (E1), protocolo MQTT (E9)
├── server/
│   ├── src/
│   │   ├── domain/          # regras puras: nada de Fastify, Mongo ou Date.now()
│   │   ├── application/     # casos de uso e portas (interfaces)
│   │   ├── infra/           # adaptadores: memoria/, mongo/, mqtt/, simulador/, push/
│   │   ├── http/            # Fastify: rotas, schemas, tratamento de erro
│   │   ├── app.ts           # buildApp(deps): monta o Fastify; os testes usam isto
│   │   └── main.ts          # raiz de composição: cria as dependências reais e sobe
│   ├── simulador/           # o "ESP32 de mentira" (E9)
│   └── package.json
└── web/                     # PWA (E10)
```

Os testes ficam ao lado do código (`horario.ts` e `horario.test.ts`).

### 3.1 Regras da casa

1. `domain/` não importa nada de fora dele: nem Fastify, nem Mongo, nem `Date.now()`. A hora entra por parâmetro ou pela porta `Relogio`. É a mesma regra do `lib/core` do firmware.
2. Rota não tem regra de negócio: valida a forma, chama um caso de uso e traduz o resultado em status.
3. Caso de uso também não: carrega, deixa o domínio decidir, salva e publica os eventos.
4. Toda regra nasce de um teste vermelho.
5. O agregado não tem setter público. Ele muda só por métodos com nome do domínio (`trocarAgenda`, não `setAgenda`).

---

## 4. Como funciona a mentoria

1. Você avisa a etapa: "bora E3".
2. O Claude explica o conceito com um exemplo **fora** do domínio do alimentador, para não entregar a resposta, e tira as dúvidas.
3. Você escreve os testes da lista e vê todos falharem. Depois faz passar e refatora.
4. Você pede a revisão ("revisa a E3"). O Claude lê os arquivos direto no repositório do sistema e roda os testes. A revisão aponta o problema e o porquê, sem reescrever o seu código.
5. A etapa fecha quando o "Pronto quando" bate.

- A lista de testes é o mínimo. Se você achar um caso que falta, escreva.
- O Claude não escreve o código do servidor nem do PWA. Se você travar e pedir, ele mostra só o trecho que destrava.
- Se uma etapa parecer cerimônia demais para o tamanho do problema, avise: dá para enxugar.

---

## 5. Etapas

Nenhuma etapa precisa de peça: o roteiro inteiro roda no PC, em paralelo ao hardware. Total: ~55–90 h.

| Etapa | Entrega | Horas |
|---|---|---|
| E0 | Ambiente e esqueleto | 2–3 |
| E1 | Glossário e modelo no papel | 1–2 |
| E2 | Value objects: `Horario` e `Porcoes` | 2–3 |
| E3 | Agregado `Alimentador`: configuração e agenda | 4–6 |
| E4 | Casos de uso e repositório em memória | 3–4 |
| E5 | Fastify: `/v1/config` e `/v1/schedules` | 4–6 |
| E6 | MongoDB | 4–6 |
| E7 | Porta `Dispositivo` e "servir agora" | 4–6 |
| E8 | Eventos, histórico e status | 4–6 |
| E9 | MQTT e o "ESP32 de mentira" | 8–12 |
| E10 | PWA: as telas | 12–20 |
| E11 | PWA no celular (HTTPS) | 2–4 |
| E12 | Avisos por notificação push | 4–6 |
| E13 | Deploy | 3–6 |

### E0 — Ambiente e esqueleto · 2–3 h

**Objetivo:** um projeto que compila, testa e roda em modo watch.

- [ ] No repositório do sistema, `.gitignore` com `node_modules`, `dist` e `.env`.
- [ ] `server/` como subpasta, para o `web/` e o `contratos/` entrarem do lado na E10. Dentro dela: pnpm, TypeScript `strict`, `"type": "module"`, Vitest e `tsx` para o modo dev.
- [ ] Criar as pastas `domain/`, `application/`, `infra/` e `http/`.
- [ ] Biome para lint e formatação: uma ferramenta só.
- [ ] Um teste bobo passando e um `main.ts` que sobe o Fastify com `GET /health`.
- [ ] Scripts: `pnpm test`, `pnpm dev` e `pnpm typecheck` (`tsc --noEmit`).

**Pronto quando:** `pnpm test` fica verde, `pnpm typecheck` passa sem erro e `http://localhost:3000/health` responde.

**Armadilha:** com `"module": "NodeNext"`, todo import relativo precisa terminar em `.js`, mesmo importando um arquivo `.ts`.

### E1 — Glossário e modelo no papel · 1–2 h

**Conceito:** no DDD, o código usa as mesmas palavras do domínio. Aqui você também separa **entidade** (tem identidade e muda com o tempo), **value object** (definido só pelo valor e imutável) e **agregado** (um grupo de objetos com uma raiz que protege as regras e é salvo de uma vez só).

- [ ] Escrever `docs/glossario.md` com uma linha para cada termo, tirada do plano: Alimentador, Configuração, Agenda, Horário, Porção, Refeição, Origem, Motivo de recusa, Tigela, Garrafa, Alerta, Dispositivo, Versão da configuração. Acrescente o que faltar.
- [ ] Classificar cada termo como entidade, value object, agregado ou "não é do servidor". Por exemplo, a máquina de estados da refeição é do ESP32.
- [ ] Listar as regras que o servidor protege. Dica: releia a seção 3.5 do plano e pergunte "que configuração faria o ESP32 recusar refeições todo santo dia?".
- [ ] Mandar para revisão **antes** de escrever código.

**Pronto quando:** glossário revisado e lista de regras fechada. Os testes da E3 saem dela.

### E2 — Value objects · 2–3 h

**Conceito:** value object é imutável, só nasce válido (se existe, está certo) e é comparado pelo valor. Construtor privado e uma fábrica `criar()`. Os erros de domínio são uma classe `ErroDeDominio` com um `codigo` (por exemplo, `horario_invalido`) que a camada HTTP traduz na E5.

**Testes, nesta ordem:**

`Horario`
- [ ] cria a partir de `"07:30"` e devolve `"07:30"` no `toString()`
- [ ] recusa `"7:30"`, `"24:00"`, `"12:60"`, `""` e `"abc"` com o código `horario_invalido`
- [ ] `minutosDoDia()` de `"07:30"` é 450
- [ ] dois `"07:30"` são iguais (`igual()`), e `"07:30"` vem antes de `"12:00"`
- [ ] a distância entre `"23:50"` e `"00:10"` é de 20 min, passando pela meia-noite

`Porcoes`
- [ ] aceita de 1 a 10 por refeição
- [ ] recusa 0, −1, 11 e 1,5 com `porcoes_invalidas`

**Pronto quando:** tudo verde, e nenhum arquivo de `domain/` importa algo de fora dele.

### E3 — Agregado `Alimentador` · 4–6 h

**Conceito:** a raiz do agregado é a única porta para mudar o que está dentro dele e garante as regras a cada mudança. Uma mudança entra inteira ou não entra. A `versao` sobe a cada mudança aceita: ela serve para o ESP32 saber se está atualizado (E9) e para o banco detectar duas edições ao mesmo tempo (E6). Cada mudança aceita registra um **evento de domínio**, que o caso de uso publica depois de salvar.

**Testes:**
- [ ] um alimentador novo nasce com a configuração padrão (seção 3.5 do plano) e versão 1
- [ ] trocar a agenda por uma válida sobe a versão em 1
- [ ] recusa mais de 8 horários (`agenda_cheia`)
- [ ] recusa dois horários iguais (`horario_repetido`)
- [ ] recusa uma agenda cujas porções ativas somam mais que o limite diário (`agenda_acima_do_limite`). Horário desativado não entra na soma
- [ ] recusa dois horários ativos mais próximos que o intervalo mínimo, inclusive passando pela meia-noite (`horarios_muito_proximos`)
- [ ] as mesmas regras valem no outro sentido: baixar o limite diário ou aumentar o intervalo mínimo de um jeito que invalida a agenda atual também é recusado
- [ ] recusa `anguloEncher` igual a `anguloServir`, ou fora de 0–180
- [ ] uma mudança recusada não altera nada: nem a agenda, nem a versão
- [ ] toda mudança aceita registra o evento `ConfiguracaoAlterada` com a versão nova

**Pronto quando:** tudo verde, e não há como deixar o alimentador inválido pelo lado de fora: sem setter público e sem array exposto em que dê para fazer `push`.

### E4 — Casos de uso e repositório em memória · 3–4 h

**Conceito:** a camada de aplicação orquestra: carrega, deixa o domínio decidir, salva e publica os eventos. As **portas** são interfaces que a aplicação define e a infraestrutura implementa (inversão de dependência). Nos testes, use **fakes** em memória, não mocks de biblioteca.

**Portas:** `AlimentadorRepository`, `Relogio` e `PublicadorDeEventos`.

**Testes:**
- [ ] `ObterAlimentador`, na primeira execução, cria o alimentador padrão e o salva
- [ ] `AtualizarAgenda` com agenda válida salva e devolve a versão nova
- [ ] `AtualizarAgenda` com agenda inválida devolve o erro do domínio e não salva nada
- [ ] `AtualizarConfiguracao`, com os mesmos dois casos
- [ ] os eventos do agregado chegam ao `PublicadorDeEventos` **depois** de salvar, nunca antes nem quando a gravação falha
- [ ] `atualizadoEm` vem do `Relogio`; nos testes, um `RelogioFixo`

**Pronto quando:** os casos de uso rodam nos testes só com adaptadores em memória.

**Armadilha:** um repositório em memória que guarda a **referência** do objeto deixa testes passarem por engano. Guarde uma cópia.

### E5 — Fastify: `/v1/config` e `/v1/schedules` · 4–6 h

**Conceito:** `buildApp(deps)` recebe as dependências prontas, então o mesmo app roda nos testes com fakes e no `main.ts` com os adaptadores reais. Plugins e encapsulamento do Fastify, type provider do Zod e um `setErrorHandler` central. Erro de forma (Zod) é 400; regra do domínio é 422.

**Testes, com `app.inject()` e sem abrir porta:**
- [ ] `GET /v1/schedules` → 200 com a agenda
- [ ] `PUT /v1/schedules` válido → 200 com a versão nova
- [ ] `PUT` com `porcoes: "dois"` → 400
- [ ] `PUT` com 9 horários → 422 e `{ "motivo": "agenda_cheia" }`
- [ ] `GET` e `PUT /v1/config`, com os mesmos critérios
- [ ] um erro inesperado vira 500 com mensagem genérica: sem stack no corpo, mas registrado no log
- [ ] o `main.ts` monta tudo com os adaptadores em memória

**Pronto quando:** dá para ler e mudar a agenda e a configuração pelo Bruno, e os testes de rota passam.

### E6 — MongoDB · 4–6 h

**Conceito:** o repositório devolve o **agregado inteiro**, nunca o documento. Um mapper explícito traduz os dois lados, e o `_id` do Mongo não vaza para o domínio. A concorrência otimista usa a `versao`: só grava se a versão no banco for a esperada; caso contrário, é conflito. A **suíte de contrato** é uma função de testes que recebe uma fábrica de repositório e roda igual para a versão em memória e para a do Mongo.

- [ ] `docker-compose.yml` na raiz de `dispenser/`, com a imagem oficial do Mongo e um volume nomeado
- [ ] `MongoAlimentadorRepository` com o driver oficial
- [ ] suíte de contrato rodando nos dois repositórios:
  - salvar e carregar devolve um alimentador igual
  - carregar o que não existe devolve `null`
  - dois "carrega → altera → salva" em paralelo: o segundo falha com `conflito_de_versao`
- [ ] na HTTP, `conflito_de_versao` vira 409
- [ ] o `main.ts` usa o Mongo quando existe `MONGO_URL` e a memória quando não existe
- [ ] testes do Mongo num banco separado (`dispenser_test`), limpo antes de cada teste

**Pronto quando:** reiniciar o servidor mantém a agenda, e a suíte de contrato passa nos dois repositórios.

**Armadilha:** o Vitest roda os arquivos em paralelo. Use um banco por arquivo de teste ou desligue o paralelismo nos testes de integração.

### E7 — Porta `Dispositivo` e "servir agora" · 4–6 h

**Conceito:** o ESP32 é um sistema externo com a própria linguagem. A porta `Dispositivo` fala a língua do domínio, e o adaptador traduz (camada anticorrupção). O primeiro adaptador é um **dispositivo simulado** em memória, com as mesmas regras do firmware. Ele não é regra do servidor: é um dublê do ESP32 e, de quebra, a implementação de referência do `lib/core/guard` do M5.

- [ ] porta `Dispositivo`: `servir(porcoes, { forcar, origem })` devolve `aceito`, `recusado(motivo)`, `ocupado` ou `offline`
- [ ] `DispositivoSimulado`, com os testes do M5 que valem aqui:
  - recusa quando passaria do limite diário (`limite_diario`)
  - com intervalo mínimo de 30 min, um pedido 10 min depois de outro é recusado (`intervalo`)
  - recusa com a tigela acima do limite (`tigela_com_racao`), a não ser com `forcar`
  - `forcar` nunca fura o limite diário nem o intervalo
  - a virada da meia-noite zera o contador do dia
  - um pedido enquanto serve devolve `ocupado`
  - nos testes, dá para colocar gramas na tigela e avançar o relógio
- [ ] caso de uso `ServirAgora`, com origem `interface`
- [ ] `POST /v1/feed`: aceito → 202; recusado → 429 com `{ motivo }`; ocupado → 409; offline → 503 com `{ "motivo": "alimentador_offline" }`

**Pronto quando:** pelo Bruno, dá para servir, bater no limite e ver cada recusa com o motivo certo.

### E8 — Eventos, histórico e status · 4–6 h

**Conceito:** o que o dispositivo faz chega como **evento**, um fato consumado: o servidor registra, não decide. O ESP32 pode reenviar eventos depois de ficar sem conexão, então registrar precisa ser **idempotente**: o mesmo evento duas vezes vira uma linha só. Cada evento tem um `seq` crescente, dado pelo dispositivo.

- [ ] `RegistrarEventoDoDispositivo` com os tipos `refeicao_servida`, `refeicao_recusada`, `refeicao_adiada`, `refeicao_pulada`, `garrafa_vazia` (o `VAZIO`), `sensor_sem_leitura` e `reiniciou`
- [ ] o mesmo `seq` duas vezes grava uma vez
- [ ] um evento que chega fora de ordem entra no lugar certo do histórico, ordenado pela hora do evento
- [ ] `GET /v1/history?limit=50`, do mais recente para o mais antigo; `limit` acima de 200 → 400
- [ ] `GET /v1/status`: o último estado informado pelo dispositivo (tigela, garrafa, sensores, online ou offline, versão da configuração aplicada) e o "hoje" (porções e gramas) calculado a partir do histórico
- [ ] o "hoje" usa o fuso da configuração, não o do servidor: um evento às 22:30 de Brasília (01:30 UTC) conta no dia certo
- [ ] repositório de eventos em memória e no Mongo, com a mesma ideia de suíte de contrato e um índice único em `{ dispositivoId, seq }`

**Pronto quando:** o dispositivo simulado gera refeições, e o histórico e o status batem com elas.

### E9 — MQTT e o "ESP32 de mentira" · 8–12 h

**Conceito:** publicar e assinar (pub/sub), broker, QoS 0 e 1, mensagem retida, last will (LWT) e sessão persistente. Pedido e resposta sobre MQTT, com um `id` de correlação e um prazo.

- [ ] Mosquitto no `docker-compose.yml`, com usuário e senha
- [ ] Fechar o contrato de tópicos (proposta abaixo) em `docs/protocolo-mqtt.md`. É ele que o firmware segue no M6
- [ ] `MqttDispositivo` implementando a mesma porta da E7, sem mudar nenhum teste do `ServirAgora`
- [ ] Simulador como processo separado (`pnpm simulador`), conectado ao Mosquitto como se fosse o ESP32 e reaproveitando as regras do `DispositivoSimulado`. Ele roda a agenda sozinho, manda eventos com `seq` e publica o estado de tempos em tempos. Uma opção de relógio acelerado ajuda nos testes
- [ ] Cada `ConfiguracaoAlterada` publica a configuração **retida**. O dispositivo aplica e devolve a versão no estado, e o status mostra "sincronizado" ou "pendente"
- [ ] Derrubar o simulador deixa o status offline (LWT). Ao religar, ele recebe a configuração retida e reenvia os eventos depois do `ultimoSeq`
- [ ] Os comandos de manutenção da seção 3.5 do plano (tara, calibrar a balança, calibrar a dose, testar o servo, reconhecer o alerta) seguem o mesmo caminho do servir

**Proposta de tópicos** (`{id}` é o identificador do alimentador):

| Tópico | Sentido | QoS / retido | Conteúdo |
|---|---|---|---|
| `alimentador/{id}/config` | servidor → ESP32 | 1, retido | configuração completa, com a `versao` |
| `alimentador/{id}/sync` | servidor → ESP32 | 1, retido | `{ ultimoSeq }`: o ESP32 reenvia o que veio depois |
| `alimentador/{id}/cmd` | servidor → ESP32 | 1 | `{ id, tipo, ... }`: servir, tara, calibrar, testar servo, reconhecer alerta |
| `alimentador/{id}/cmd/resp` | ESP32 → servidor | 1 | `{ id, resultado, motivo? }` |
| `alimentador/{id}/evento` | ESP32 → servidor | 1 | `{ seq, tipo, hora, porcoes, gramas, origem }` |
| `alimentador/{id}/estado` | ESP32 → servidor | 0, retido | tigela, garrafa, sensores, `configVersao`, rssi |
| `alimentador/{id}/online` | ESP32 → servidor | 1, retido, LWT | `"1"` ao conectar; o broker publica `"0"` quando ele some |

**Pronto quando:** com o servidor parado, o simulador continua servindo pela agenda; ao religar o servidor, o histórico se completa sozinho.

### E10 — PWA: as telas · 12–20 h

**Conceito:** o PWA é só um cliente da API `/v1`. Os testes ficam na lógica (tradução de erros, fluxos), não nos pixels. A API é simulada nos testes com MSW.

- [ ] Transformar `dispenser/` num workspace do pnpm com `server`, `web` e `contratos`. Os schemas Zod da API vão para `contratos`, e o servidor e o PWA usam os mesmos tipos
- [ ] Projeto `web/` em React + Vite + TS, com o proxy do Vite apontando `/v1` para o Fastify
- [ ] Telas:
  1. **Início:** estado, online ou offline, última refeição, porções de hoje contra o limite, peso na tigela, nível da garrafa em % e em dias, e o botão "servir agora", que vira "servir mesmo assim" quando a tigela tem ração.
  2. **Agenda:** horários com porções, ativar e desativar, no máximo 8, e o aviso "sincronizado" ou "pendente".
  3. **Histórico:** hora, porções, gramas, origem (agenda, interface, Alexa) e resultado.
  4. **Ajustes:** gramas por porção, tara e calibração da balança, limite da tigela, limite diário, intervalo mínimo, altura da garrafa, ângulos do servo com botão de teste e fuso.
- [ ] Testes primeiro:
  - cada `motivo` vira uma mensagem clara: "Limite de hoje atingido", "A tigela ainda tem 12 g", "Já está servindo", "O alimentador está offline"
  - com `tigela_com_racao`, o botão vira "servir mesmo assim" e manda `forcar: true`
  - um 422 da agenda aparece no horário que causou o erro
  - cada tela tem estado de carregando e de erro de rede
- [ ] Em produção, o build do `web` é servido pelo Fastify com `@fastify/static`, e `/v1/*` continua sendo a API

**Pronto quando:** dá para operar tudo pelo navegador do PC, com o simulador do outro lado.

### E11 — PWA no celular · 2–4 h

**Conceito:** para instalar o PWA e registrar o service worker, o navegador exige HTTPS (ou `localhost`). O service worker guarda o "casco" do app (HTML, JS, CSS). A API passa sempre pela rede: um "servir" nunca pode sair do cache.

- [ ] HTTPS. Recomendação: **Tailscale**. O `tailscale serve` dá um endereço `https://<máquina>.<sua-rede>.ts.net` com certificado válido; só os seus aparelhos acessam, e funciona pelo 4G sem abrir porta no roteador
- [ ] `manifest` com nome, ícones de 192 e 512 px, `display: standalone` e cor do tema
- [ ] Instalar na tela inicial. Aberto sem internet, o app mostra o aviso "sem conexão" no lugar da página de erro do navegador
- [ ] Lighthouse aprovando o PWA como instalável

**Pronto quando:** o ícone está na tela inicial do celular e o app funciona fora de casa, pelo 4G.

### E12 — Avisos por notificação push · 4–6 h

**Decisão desta etapa:** se a notificação push funcionar no seu celular, os avisos ficam no servidor e o Telegram (M8) não entra. O ESP32 fica com menos código e menos memória ocupada. No Android funciona direto; no iPhone, só com o PWA instalado na tela inicial (iOS 16.4 ou mais novo).

- [ ] Porta `Notificador`, com o adaptador de push (biblioteca `web-push`, chaves VAPID) e um em memória para os testes
- [ ] Avisos do M8: garrafa abaixo de 20%, porção que não saiu (`VAZIO`), refeição pulada, sensor sem leitura, ESP32 reiniciado
- [ ] Um aviso novo, que só existe com servidor: **alimentador offline há mais de 30 min**
- [ ] Um aviso por ocorrência: o mesmo problema não notifica de novo a cada estado recebido

**Pronto quando:** com o celular bloqueado, chega a notificação "garrafa abaixo de 20%" quando o simulador baixa o nível.

### E13 — Deploy · 3–6 h

**Decisão desta etapa:** onde o servidor roda. Recomendação: **em casa** (PC que fica ligado, Raspberry Pi, mini PC ou notebook velho) com Tailscale. O ESP32 conversa com o broker na rede local, sem TLS, o que economiza memória dele, e nada fica exposto na internet. A nuvem só faz sentido se não houver nenhuma máquina ligada 24 h; nesse caso, o broker precisa de TLS e senha.

- [ ] `Dockerfile` do servidor em múltiplos estágios, e um compose com servidor, Mongo e Mosquitto, todos com `restart: unless-stopped`
- [ ] IP reservado no roteador para a máquina do servidor, porque o ESP32 precisa achar o broker
- [ ] Backup diário do Mongo com `mongodump`
- [ ] Senhas e chaves em variáveis de ambiente, fora do git

**Pronto quando:** o servidor volta sozinho depois de reiniciar a máquina, e o celular acessa pelo 4G.

---

## 6. Ligação com o firmware

- **O simulador é a especificação do firmware.** O `docs/protocolo-mqtt.md` (E9) e as regras do `DispositivoSimulado` (E7) são o que o M5 e o M6 implementam em C++. Os testes da E7 viram os testes Unity do `lib/core/guard`.
- **O ESP32 fica mais simples:** deixa de servir a API REST e a interface, e ganha um cliente MQTT. Os detalhes estão no plano (D11, D19 e M6).
- **Trocar o simulador pela placa não muda o servidor.** É o teste final das portas e adaptadores.

---

## 7. Histórico de mudanças

| Data | Mudança |
|---|---|
| 30/10/2026 | Roteiro criado: servidor Fastify com DDD e MongoDB como companheiro do ESP32, que continua autônomo; MQTT entre os dois; PWA servido pelo servidor. Formato de mentoria com TDD. |
