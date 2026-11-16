# Comedouro — Roteiro do Produto (contas, vários comedouros, nuvem)

> Próxima fase do sistema: transformar o servidor de uma casa num serviço na nuvem, onde cada pessoa entra com a conta Google e cuida dos próprios pets e comedouros.
> Continua o [ROTEIRO-SISTEMA.md](ROTEIRO-SISTEMA.md) (E0–E13). As decisões vieram de um grill em 16/11/2026.
> **Formato:** o Claude implementa o servidor e o PWA com TDD, uma etapa por vez, com commit e explicação ao fim de cada uma. O firmware (seção 6) é seu, com mentoria no método do [mentoria.md](mentoria.md). Toda tela nova segue o [UI-UX.md](UI-UX.md).
>
> **Progresso (16/11/2026):** P1 e P2 concluídas (da P1, falta só você testar com uma conta Google de verdade). 255 testes no servidor e 63 no app.

---

## 1. O que muda, e o que não muda

**Muda:** o sistema deixa de ter um comedouro fixo no `.env` (`FEEDER_ID`) e um dono implícito. Passa a ter usuários, e cada usuário tem N pets e N comedouros, cada comedouro com a própria configuração, agenda, histórico e avisos.

**Não muda:**
- **O ESP32 continua autônomo.** Ele segue a última configuração recebida e serve o gato com o servidor ou a internet fora do ar.
- **O domínio do comedouro.** As regras R1–R12 do [glossário](glossario.md), o agregado `Feeder` e a agenda diária ficam como estão.
- **O protocolo MQTT**, exceto a conexão (credenciais por aparelho e TLS) e o campo novo de pausa.

---

## 2. Decisões

| # | Decisão | Escolha | Por quê |
|---|---|---|---|
| D1 | Público | Serviço na nuvem, aberto: qualquer pessoa cria conta e liga o próprio comedouro | É o que faz parecer produto |
| D2 | Login | Só "Entrar com Google". O servidor confere o token do Google e abre uma sessão própria em cookie | Sem senha para guardar, sem e-mail de recuperação |
| D3 | Dono | Cada pet e cada comedouro tem **um dono só**. Sem compartilhar entre contas | Isolamento simples: toda consulta filtra pelo dono |
| D4 | Pareamento | Código de 6 dígitos gerado no app, digitado no portal Wi-Fi do ESP32. O servidor troca o código por credenciais MQTT únicas daquele aparelho | Funciona sem câmera nem QR; o QR do futuro só preenche o mesmo código |
| D5 | Pet | Só cadastro: nome, espécie (gato ou cachorro), nascimento, peso e foto opcional. **Sem vínculo com comedouro** | O comedouro não sabe qual bicho comeu; um vínculo prometeria um dado que não existe |
| D6 | Nome nas frases | O comedouro ganha um **apelido** ("Comedouro da sala"), usado nas frases da tela. O `nomeDoGato` sai da configuração | Consequência da D5 |
| D7 | Dashboard | Lista de comedouros, um cartão por comedouro, com os problemas no topo. Tocar abre as quatro telas de hoje daquele comedouro | Responde "está tudo bem?" para todos de uma vez (UI-UX, seção 6) |
| D8 | Agenda | Continua diária, como hoje | Domínio e firmware já prontos |
| D9 | Sem aparelho | Ao adicionar: "Tenho um aparelho" ou "Experimentar sem aparelho" (comedouro simulado, marcado como tal) | Dá para testar e mostrar sem hardware |
| D10 | Hospedagem | VPS com o compose atual + proxy com HTTPS automático + MQTT com TLS na porta 8883 | Barato, e o broker embutido continua |
| D11 | Extras desta fase | Previsão da ração, pausar comedouro, excluir conta e dados, copiar agenda | Escolhidos no grill |
| D12 | Fica para depois | Alexa, configuração por QR Code, compartilhar comedouro entre contas | Fora do escopo agora |

**Padrões que o Claude escolheu** (mude se discordar):

| # | Padrão |
|---|---|
| D13 | Foto do pet reduzida no app para ~512 px (JPEG/WebP, < 150 KB) e guardada no próprio Mongo. Sem serviço de arquivos |
| D14 | Código de pareamento vale **10 minutos** e serve **uma vez**. Rota de pareamento com limite de tentativas por IP, e o código morre depois de 5 erros |
| D15 | Remover um comedouro apaga as credenciais dele e derruba a conexão. O ESP32, ao ser recusado pelo broker, volta para o modo de pareamento |
| D16 | Notificações push ficam ligadas à **conta**; o texto leva o apelido do comedouro ("Comedouro da sala: garrafa abaixo de 20%") |
| D17 | Recurso de outro dono responde **404**, não 403: ninguém descobre que aquele id existe |
| D18 | Limites por conta: 10 comedouros, 20 pets, 1 comedouro simulado. Evita abuso num serviço aberto (o simulado roda dentro do servidor) |
| D19 | Pausa para só a **agenda**. "Servir agora" continua funcionando, porque é um pedido explícito de quem está olhando |
| D20 | Copiar agenda copia os horários e os limites (diário, tigela, intervalo). **Não** copia calibração, ângulos, tara nem altura da garrafa: isso é de cada aparelho |
| D21 | Em desenvolvimento (`NODE_ENV` diferente de `production`), um botão "Entrar como dev" dispensa o Google. Em produção, essa rota nem existe |

---

## 3. Arquitetura

```
  Celular (PWA) ──HTTPS──► Proxy (TLS) ──► Servidor Fastify ──► MongoDB
                                             │  http/        rotas, sessão, dono
                                             │  application/ casos de uso + portas
                                             │  domain/      User, Pet, Feeder, Pairing
                                             │  infra/       Mongo, Google, MQTT, push
                                             │
  ESP32 (casa A) ──MQTT TLS 8883──► broker embutido (aedes)
  ESP32 (casa B) ──┘                 · usuário/senha por aparelho
                                     · cada aparelho só usa alimentador/<seu id>/#
```

### 3.1 Modelo

| Agregado | Campos novos ou alterados | Regras |
|---|---|---|
| `User` | `id`, `googleSub` (único), `email`, `nome`, `foto?`, `criadoEm` | Criado no primeiro login; atualizado a cada login |
| `Session` | hash do token, `userId`, `expiraEm` (30 dias, renovada no uso) | Índice TTL no Mongo apaga as vencidas |
| `Pet` | `ownerId`, `nome` (1–30), `especie` (`gato` \| `cachorro`), `nascimento?` (não futuro), `pesoKg?` (0,1–100), `foto?` | Máx. 20 por conta |
| `Feeder` | + `ownerId`, `apelido` (1–30), `tipo` (`aparelho` \| `simulado`), `pausa` (`null` \| `{ ate: data \| null }`), `pareadoEm?` | Máx. 10 por conta, 1 simulado. Sai o `petName` |
| `PairingCode` | `codigo` (6 dígitos), `feederId`, `expiraEm`, `tentativas`, `usado` | Uso único, 10 min, morre em 5 erros |
| `DeviceCredential` | `feederId`, `usuario`, hash da `senha` | Apagada ao remover o comedouro |

### 3.2 API

Todas as rotas (menos login e pareamento) exigem sessão. As rotas de hoje passam a ficar debaixo do comedouro:

| Antes | Depois |
|---|---|
| — | `POST /v1/sessao` (token do Google) · `DELETE /v1/sessao` · `GET /v1/eu` · `DELETE /v1/eu` |
| — | `GET/POST /v1/pets` · `GET/PUT/DELETE /v1/pets/:id` |
| — | `GET /v1/comedouros` (dashboard) · `POST /v1/comedouros` · `PATCH/DELETE /v1/comedouros/:id` |
| — | `POST /v1/comedouros/:id/codigo` (novo código) · `POST /v1/dispositivos/parear` (chamada pelo ESP32, sem sessão) |
| `/v1/status`, `/v1/config`, `/v1/schedules`, `/v1/feed`, `/v1/history`, … | `/v1/comedouros/:id/status`, `/config`, `/schedules`, `/feed`, `/history`, … |
| `/v1/push/*` | igual, mas ligado ao usuário da sessão |

### 3.3 Segurança (serviço aberto)

- Cookie de sessão `httpOnly`, `Secure`, `SameSite=Lax`. Rotas que mudam algo exigem `Content-Type: application/json` e conferem o `Origin` (proteção contra CSRF).
- No banco, o token da sessão e a senha MQTT ficam só como hash.
- Limite de requisições no login e no pareamento (`@fastify/rate-limit`).
- Todo caso de uso recebe o `userId` e só enxerga o que é dele. Um teste por rota confirma que o comedouro de outra conta responde 404.
- Mongo e as portas internas fora da internet; só o 443 e o 8883 ficam abertos.

---

## 4. Etapas

| Etapa | Entrega | Horas | Situação |
|---|---|---|---|
| P1 | Contas: login com Google, sessão, dono | 6–8 | ✅ Concluída. Falta o teste com o seu Client ID |
| P2 | Vários comedouros: apelido, rotas por comedouro, broker por aparelho | 8–12 | ✅ Concluída |
| P3 | Pets | 4–6 | ⬜ |
| P4 | Pareamento e comedouro simulado | 6–8 | ⬜ |
| P5 | Dashboard, previsão, pausa e copiar agenda | 6–10 | ⬜ |
| P6 | Excluir conta e dados | 2–3 | ⬜ |
| P7 | Deploy na VPS | 4–8 | ⬜ |

### P1 — Contas · 6–8 h

**Objetivo:** ninguém usa o app sem entrar, e a sessão sobrevive a fechar o navegador.

> ✅ **Concluída em 16/11/2026.** Diferenças: não precisou de `SESSION_SECRET` (o token da sessão é aleatório e o banco guarda só o hash, então não há nada para assinar); entraram `DEV_LOGIN` e `COOKIE_SECURE` no `.env`, para o Docker continuar usável em casa; a "tela Conta" virou o cartão **Ajustes → Sua conta** até o dashboard da P5 existir. O "dono" de cada comedouro chega na P2: por enquanto, toda conta vê o mesmo.

- [x] Porta `IdentityVerifier` (confere o token do Google e devolve `sub`, e-mail, nome e foto). Adaptador com `google-auth-library`; um falso nos testes
- [x] Agregado `User` e repositório (memória + Mongo, mesma suíte de contrato)
- [x] Sessão: token aleatório de 32 bytes no cookie, hash no Mongo, índice TTL, renovação no uso
- [x] Rotas `POST /v1/sessao`, `DELETE /v1/sessao`, `GET /v1/eu`; gancho do Fastify que barra as demais sem sessão (401)
- [x] "Entrar como dev" fora de produção (D21)
- [x] PWA: tela de login (botão do Google, seguindo o UI-UX), tela "Conta" com nome, foto e "Sair"; um 401 em qualquer chamada leva ao login
- [x] `.env`: `GOOGLE_CLIENT_ID` (o `SESSION_SECRET` não foi preciso); o [GUIA](GUIA.md) ganha o passo a passo do Google Cloud Console

**Testes primeiro:** token inválido → 401; primeiro login cria o usuário, o segundo reaproveita; sessão vencida → 401; "Sair" invalida o cookie; rota sem sessão → 401.

**Pronto quando:** você entra com a sua conta Google no navegador do PC, fecha, abre de novo e continua dentro.

**Você precisa fazer:** criar no Google Cloud Console um "ID do cliente OAuth" do tipo aplicativo web, com `http://localhost:5173` e `http://localhost:3000` nas origens autorizadas.

### P2 — Vários comedouros · 8–12 h

**Objetivo:** cada conta tem os próprios comedouros, e cada aparelho só enxerga os próprios tópicos.

> ✅ **Concluída em 16/11/2026.** Diferenças em relação ao plano:
> - **Dono e apelido ficaram num agregado separado**, o `FeederProfile` (id, dono, apelido, tipo, criado em). O `Feeder` continua só com as regras R1–R12. Assim, trocar o apelido não disputa versão com quem está salvando a agenda, e o domínio do comedouro não mudou. A `pausa` entra no `Feeder` na P5, porque mexe na agenda.
> - **A credencial do aparelho já existe**, mas sai na criação: ao criar um comedouro do tipo "aparelho", o app mostra o usuário e a senha uma vez. Na P4, isso vira o código de 6 dígitos.
> - **Saíram o `MQTT_URL` e o `FEEDER_ID`.** Com credencial por aparelho, só o broker embutido sabe conferir quem é quem.
> - **No app, a lista de comedouros é simples** (apelido e estado em palavras). O dashboard com última e próxima refeição e nível da garrafa é a P5. Notificações e "Sua conta" foram para a lista, porque são da conta, e não de um comedouro.
> - **Ao remover**, o servidor publica mensagens retidas vazias nos tópicos do comedouro e derruba o aparelho. Testado de ponta a ponta com o `pnpm simulador`.

- [x] `Feeder` ganha `ownerId`, `apelido`, `tipo` e `pausa` (a pausa só aparece na P5); sai o `petName` / `nomeDoGato`
- [x] Repositório busca por `id` **e** `ownerId`; casos de uso recebem o `userId`
- [x] Rotas de hoje passam para `/v1/comedouros/:id/...`; `GET/POST/PATCH/DELETE /v1/comedouros`
- [x] Sai o `FEEDER_ID` do `.env` e o "um dispositivo só" da composição: um `DeviceGateway` cuida de N comedouros (um `MqttDevice` ou `InProcessDevice` por id)
- [x] Broker: autenticação pelo `DeviceCredential` (ou pelo usuário do servidor); autorização que limita cada aparelho a `alimentador/<seu id>/#`
- [x] Avisos e push por usuário, com o apelido no texto (D16)
- [x] PWA: rotas com URL (`/comedouros/:id/agenda`), as quatro telas de hoje recebem o id; frases usam o apelido

**Testes primeiro:** comedouro de outra conta → 404 em todas as rotas; aparelho A não consegue assinar nem publicar em `alimentador/B/#`; criar dois comedouros gera duas configurações retidas independentes.

**Pronto quando:** duas contas, cada uma com um comedouro simulado, usam o app ao mesmo tempo sem uma ver a outra.

### P3 — Pets · 4–6 h

- [ ] Agregado `Pet` com as regras da tabela 3.1; repositório com suíte de contrato
- [ ] Rotas `/v1/pets` com o mesmo cuidado de dono
- [ ] PWA: lista de pets e formulário (nome, espécie, nascimento, peso, foto). A foto é reduzida no próprio celular antes de enviar (D13)
- [ ] Idade calculada na tela ("2 anos e 3 meses"), não guardada

**Testes primeiro:** nome vazio ou com mais de 30 letras → 422; nascimento no futuro → 422; peso fora da faixa → 422; foto acima do limite → 413; pet de outra conta → 404; 21º pet → 422.

**Pronto quando:** você cadastra o seu gato com foto pelo celular.

### P4 — Pareamento e simulado · 6–8 h

**Objetivo:** um comedouro novo entra na conta sem ninguém mexer no código.

- [ ] "Adicionar comedouro" pergunta o apelido e o tipo:
  - **Tenho um aparelho:** cria o comedouro "aguardando pareamento" e mostra o código de 6 dígitos com a contagem de 10 min e o botão "Gerar outro"
  - **Experimentar sem aparelho:** cria o comedouro simulado, já online, com a etiqueta "Simulado" (máx. 1 por conta)
- [ ] `POST /v1/dispositivos/parear { codigo }`: devolve `{ feederId, mqttHost, mqttPort, usuario, senha }` uma única vez, guarda só o hash da senha e marca o código como usado
- [ ] Limite de tentativas por IP e por código (D14)
- [ ] A tela do código percebe sozinha quando o aparelho conecta e mostra "Pareado"
- [ ] O simulador de processo (`pnpm simulador`) passa a parear pelo código, como o ESP32 fará; é ele que testa o fluxo inteiro
- [ ] Remover comedouro (D15): apaga credenciais, derruba a conexão e limpa as mensagens retidas
- [ ] [protocolo-mqtt.md](protocolo-mqtt.md) ganha a seção "Pareamento"

**Testes primeiro:** código vencido, usado ou errado → recusa sem dizer qual dos três; 6ª tentativa → bloqueado; credencial de comedouro removido → broker recusa.

**Pronto quando:** `pnpm simulador --codigo 123456` aparece como online na conta certa.

### P5 — Dashboard, previsão, pausa, copiar agenda · 6–10 h

- [ ] `GET /v1/comedouros` devolve um resumo por comedouro: estado, última e próxima refeição, nível da garrafa, dias restantes, pausa
- [ ] Dashboard no PWA: cartões ordenados por gravidade (problema, aviso, ok); sem comedouros, um convite para adicionar o primeiro
- [ ] **Previsão:** usa o `diasRestantes` que o aparelho já manda; sem ele, o servidor calcula pelo consumo médio dos últimos 7 dias. Aviso push quando faltar 2 dias (um por ocorrência, como os outros)
- [ ] **Pausa:** "Pausar" com "até eu religar" ou "até tal dia". Vai na configuração retida (campo `pausa`), o simulado respeita, e a frase da tela diz "Pausado até 20/11" (D19)
- [ ] **Copiar agenda:** ao criar ou em Ajustes, "Copiar de…" outro comedouro seu (D20), passando pelas mesmas regras R1–R6
- [ ] [protocolo-mqtt.md](protocolo-mqtt.md): campo `pausa` documentado

**Pronto quando:** com dois comedouros, o que tem problema aparece primeiro, e pausar um deles faz o simulado pular a próxima refeição.

### P6 — Excluir conta · 2–3 h

- [ ] Em "Conta", "Excluir conta e dados": pede para digitar `excluir`
- [ ] Apaga usuário, sessões, pets, comedouros, eventos, avisos, inscrições push e credenciais, e limpa as mensagens retidas. Os aparelhos voltam ao modo de pareamento (D15)

**Testes primeiro:** depois de excluir, nenhum documento com aquele `userId` sobra em nenhuma coleção; o login seguinte cria uma conta nova e vazia.

### P7 — Deploy na VPS · 4–8 h

- [ ] Domínio (próprio ou gratuito, tipo DuckDNS) apontando para a VPS
- [ ] Proxy com HTTPS automático na frente do Fastify
- [ ] **Decidir na etapa:** o TLS do MQTT na 8883. Opção A: Caddy no HTTPS e o próprio Node abrindo a 8883 com o certificado que o Caddy renova. Opção B: Traefik no lugar do Caddy, que termina TLS de HTTP e de TCP com o mesmo certificado
- [ ] Firewall: só 22, 443 e 8883. Mongo sem porta exposta
- [ ] Backup diário do Mongo, com cópia fora da VPS
- [ ] `GOOGLE_CLIENT_ID` de produção com a origem do domínio
- [ ] [GUIA.md](GUIA.md) reescrito: de "servidor em casa" para "serviço na nuvem" (instalar, configurar, adicionar comedouro)

**Pronto quando:** uma pessoa de fora entra com a conta Google dela, cria um comedouro simulado e recebe push no celular.

---

## 5. Documentos que mudam

| Documento | Mudança |
|---|---|
| [glossario.md](glossario.md) | Usuário, Pet, Apelido, Pareamento, Código de pareamento, Credencial do aparelho, Pausa |
| [protocolo-mqtt.md](protocolo-mqtt.md) | Conexão com TLS e credencial por aparelho, seção de pareamento, campo `pausa` |
| [GUIA.md](GUIA.md) | Login, adicionar comedouro, deploy na VPS |
| [UI-UX.md](UI-UX.md) | Telas novas: login, dashboard, pets, conta, adicionar comedouro |

---

## 6. A sua parte: firmware

O servidor fica pronto antes, e o simulador mostra o caminho. Cada item segue a mentoria: exemplo resolvido, você escreve, o Claude revisa.

| # | Entrega | Depende de |
|---|---|---|
| F1 | Cliente MQTT seguindo o [protocolo](protocolo-mqtt.md): `config`, `sync`, `cmd`, `evento`, `estado`, `online` (sem TLS, contra o servidor local) | — |
| F2 | Portal Wi-Fi: sem Wi-Fi salvo, o ESP32 abre a rede "Comedouro-XXXX" com uma página que pede rede, senha e código | — |
| F3 | Pareamento: chama `POST /v1/dispositivos/parear` por HTTPS e guarda `feederId`, usuário e senha na memória permanente (NVS) | P4 |
| F4 | MQTT com TLS na 8883 (certificado raiz da Let's Encrypt embutido) | P7 |
| F5 | Respeitar a `pausa` da configuração (a agenda para, o "servir agora" não) | P5 |
| F6 | Voltar ao pareamento: botão segurado por 10 s, ou o broker recusando a credencial | P4 |

---

## 7. Histórico de mudanças

| Data | Mudança |
|---|---|
| 16/11/2026 | Roteiro criado a partir do grill: serviço na nuvem, login com Google, dono único, pareamento por código, pet só como cadastro, apelido no comedouro, dashboard em lista, simulado por conta, VPS, e os extras previsão, pausa, excluir conta e copiar agenda. |
