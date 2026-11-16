# Guia de uso e configuração

> Como instalar, configurar e usar o sistema do comedouro: o servidor, o app no celular e a ligação com o ESP32.
> Para entender o projeto inteiro, veja o [plano](PLANO-DE-ACAO.md). Para o contrato com o firmware, o [protocolo MQTT](protocolo-mqtt.md).

## 1. O que é

```
  Celular (app) ──HTTPS──► Servidor ──► MongoDB
                             │
                             │ MQTT (o ESP32 abre a conexão)
                             ▼
                           ESP32 ──► servo, balança, sensor de nível
```

- **O servidor** guarda a configuração, a agenda e o histórico, manda os avisos e entrega o app.
- **O ESP32** decide cada porção: agenda, limite diário, intervalo mínimo e tigela. Se o servidor cair, ele continua servindo pela agenda e manda o histórico quando o servidor voltar.
- **O app** é um PWA: abre no navegador e pode ser instalado na tela inicial do celular.

Cada pessoa entra com a conta dela e tem os próprios comedouros (até 10). Um comedouro é de um destes tipos:

| Tipo | Para quê | O que precisa |
|---|---|---|
| **Simulado** ("Experimentar sem aparelho") | Ver o app funcionando sem nenhuma peça. Um por conta | Nada |
| **Aparelho**, com o `pnpm simulador` | Testar o caminho real (pareamento e broker MQTT) sem a placa | `.env` com o broker, e o simulador pareado com o código do comedouro |
| **Aparelho**, com o ESP32 | O uso de verdade | `.env` com o broker, e a placa com o firmware, pareada com o código |

## 2. Começar em 2 minutos (modo demonstração)

Você precisa do Docker Desktop aberto. Na raiz do repo:

```
docker compose up -d --build
```

Antes da primeira vez, crie na raiz do repo um arquivo `.env` com uma linha só: `DEV_LOGIN=true`. Ela liga o botão "Entrar como dev", que dispensa a conta Google (seção 3.5).

Abra **http://localhost:3000** e toque em "Entrar como dev". Na lista de comedouros, adicione um com o tipo **"Experimentar sem aparelho"**: um alimentador de mentira passa a rodar dentro do servidor. Dá para servir, montar a agenda e ver o histórico. Em **Ajustes → Simulador**, você põe ração na tigela ou esvazia a garrafa para ver as recusas e os avisos acontecerem.

Para parar: `docker compose down`. Os dados ficam guardados no volume do MongoDB.

**Sem Docker**, com Node 24 e pnpm:

```
cd web    && pnpm install && pnpm build
cd server && pnpm install && pnpm dev
```

Abra **http://localhost:3000** e toque em "Entrar como dev" (fora do Docker, ele já vem ligado). Nesse caso, os dados ficam em memória e somem quando o servidor para.

## 3. Configuração

Copie o `.env.example` para `.env`, na raiz do repo, e preencha. O `.env` não vai para o git. Depois de mudar o `.env`, recrie o servidor: `docker compose up -d`.

### 3.1 Dispositivo

| Variável | Padrão | O que faz |
|---|---|---|
| `MQTT_BROKER_PORT` | vazia | Com um valor (use `1883`), o servidor abre um broker MQTT nessa porta, e o app passa a aceitar comedouros do tipo "Tenho um aparelho". Sem ela, só simulados |
| `MQTT_USERNAME` | vazia | O usuário do **próprio servidor** no broker. Obrigatório com o broker |
| `MQTT_PASSWORD` | vazia | A senha do servidor no broker. Obrigatória com o broker. Use uma senha de verdade |

O mínimo para aceitar aparelhos:

```
MQTT_BROKER_PORT=1883
MQTT_USERNAME=servidor
MQTT_PASSWORD=uma-senha-so-sua
```

**Os aparelhos não usam esse usuário.** Cada comedouro do tipo "aparelho" ganha, ao ser criado, um usuário e uma senha só dele, que o app mostra **uma vez**. Com eles, o aparelho só consegue mexer nos tópicos do próprio comedouro. Remover o comedouro apaga a senha e derruba o aparelho.

O `MQTT_URL` (broker externo) e o `FEEDER_ID` deixaram de existir: o broker embutido é quem confere a senha de cada aparelho, e o id de cada comedouro vem do app.

### 3.2 Banco de dados

| Variável | Padrão | O que faz |
|---|---|---|
| `MONGO_URL` | vazia | O endereço do MongoDB. **Com o Docker Compose, não mexa**: o compose já define. Sem ela, os dados ficam em memória |
| `MONGO_DB` | `comedouro` | O nome do banco |

### 3.3 Notificações push

Sem as chaves, os avisos aparecem só dentro do app e no log do servidor.

1. Gere o par de chaves, uma vez só:
   ```
   cd server
   pnpm vapid
   ```
2. Copie a "Public Key" para `VAPID_PUBLIC_KEY` e a "Private Key" para `VAPID_PRIVATE_KEY`.
3. Em `VAPID_SUBJECT`, ponha um contato seu, no formato `mailto:voce@exemplo.com`. Os serviços de push exigem.

Não troque as chaves depois: os aparelhos já inscritos param de receber e precisam ativar de novo.

### 3.4 Servidor

| Variável | Padrão | O que faz |
|---|---|---|
| `PORT` | `3000` | A porta do app e da API |
| `HOST` | `0.0.0.0` | Em quais endereços o servidor escuta |
| `LOG_LEVEL` | `info` | `debug` mostra mais detalhes; `warn` mostra só os problemas |
| `SIM_CAT_EATS_MINUTES` | `10` | Só no modo demonstração: em quantos minutos o "gato" esvazia a tigela. `0` desliga |

### 3.5 Login

O app só abre depois de entrar. Há dois jeitos:

- **Com o Google**, o jeito de verdade. Precisa do `GOOGLE_CLIENT_ID`.
- **"Entrar como dev"**, que dispensa o Google. Serve para desenvolver e para o modo demonstração. Todo mundo que entra assim usa a mesma conta, "Dev".

| Variável | Padrão | O que faz |
|---|---|---|
| `GOOGLE_CLIENT_ID` | vazia | O "ID do cliente OAuth" do Google. Sem ele, o botão do Google não aparece |
| `DEV_LOGIN` | ligado fora do Docker, desligado no Docker | `true` mostra o botão "Entrar como dev". **Nunca ligue num servidor aberto na internet** |
| `COOKIE_SECURE` | desligado fora do Docker, ligado no Docker | Com `true`, o navegador só manda o cookie da sessão por HTTPS (`localhost` também vale). Desligue só para abrir o app por `http://` com o IP da máquina, na rede de casa |

**Como conseguir o `GOOGLE_CLIENT_ID`** (uma vez só, de graça):

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) e crie um projeto, por exemplo "Comedouro".
2. Vá em **APIs e serviços → Tela de consentimento OAuth** (em algumas versões do console, **Google Auth Platform**). Escolha o público **Externo**, ponha o nome do app ("Comedouro") e o seu e-mail de suporte.
3. Enquanto o app estiver "Em teste", só entram as contas listadas em **Usuários de teste**: adicione o seu e-mail ali. Para abrir para qualquer pessoa, publique o app. Como ele só pede nome, e-mail e foto, o Google não exige revisão.
4. Vá em **Clientes** (ou **Credenciais → Criar credenciais → ID do cliente OAuth**) e escolha **Aplicativo da Web**.
5. Em **Origens JavaScript autorizadas**, adicione cada endereço de onde você abre o app:
   - `http://localhost:3000` (Docker e `pnpm dev` do servidor)
   - `http://localhost:5173` (`pnpm dev` do app)
   - o endereço HTTPS do Tailscale, se usar (seção 6.1)

   Não precisa de "URI de redirecionamento".
6. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) para o `GOOGLE_CLIENT_ID` do `.env` e recrie o servidor.

O ID do cliente não é segredo: ele aparece no código da página de qualquer jeito. Não existe "chave secreta" neste fluxo, porque quem confere o login é o próprio servidor, com as chaves públicas do Google.

O Google só aceita origens com HTTPS, exceto o `localhost`. Para entrar pelo celular, use o endereço do Tailscale.

A sessão dura 30 dias e se renova sozinha enquanto o app é usado. "Sair" fica em **Ajustes → Sua conta**.

## 4. Rodar

### 4.1 Uso normal (Docker)

| Para | Comando, na raiz do repo |
|---|---|
| Subir, ou aplicar um `.env` novo | `docker compose up -d` |
| Subir depois de atualizar o código | `git pull` e `docker compose up -d --build` |
| Ver o log | `docker compose logs -f server` |
| Parar | `docker compose down` |

Os dois serviços têm `restart: unless-stopped`: voltam sozinhos quando a máquina reinicia, desde que o Docker Desktop esteja configurado para abrir junto com o sistema.

Portas usadas na máquina: **3000** (app e API), **1883** (broker MQTT, para o ESP32) e 27017 (MongoDB, só para o próprio computador).

### 4.2 Testar com o simulador

O simulador é um programa que se comporta como o ESP32: conecta no broker, recebe a configuração, roda a agenda e manda os eventos. Com o servidor no ar e o `.env` com o broker:

1. No app, adicione um comedouro com o tipo **"Tenho um aparelho"**. A tela dele mostra um código de 6 dígitos.
2. Rode o simulador com o código, em até 10 minutos:
   ```
   cd server
   pnpm install
   SIM_CODIGO=<código> pnpm simulador
   ```
   No PowerShell: `$env:SIM_CODIGO="<código>"; pnpm simulador`.

Ele pareia como o ESP32 vai parear e guarda o usuário e a senha em `server/.simulador.json` (fora do git). Das próximas vezes, basta `pnpm simulador`. No app, a tela do código vira a do comedouro funcionando. Se o comedouro for removido, ou pareado em outro aparelho, o simulador é derrubado, apaga o arquivo e pede um código novo, como o ESP32 vai fazer.

| Variável | Padrão | Para quê |
|---|---|---|
| `SIM_CODIGO` | vazia | O código de pareamento. Sem ele, usa o `.simulador.json` |
| `SIM_SERVIDOR` | `http://127.0.0.1:<PORT>` | Onde o servidor está, para parear |
| `SIM_ARQUIVO` | `.simulador.json` | Onde guardar a credencial. Use um arquivo por simulador para rodar mais de um |

No terminal do simulador, dá para mexer no "mundo físico": No terminal do simulador, dá para mexer no "mundo físico":

| Digite | O que acontece |
|---|---|
| `tigela 30` | Põe 30 g na tigela. O próximo "servir" é recusado |
| `garrafa 50` | Deixa 50 g na garrafa. Abaixo de 20%, chega o aviso |
| `garrafa 0` | A próxima porção não sai: alerta "A porção não saiu" |
| `balanca off` / `balanca on` | Desliga e religa a balança |
| `nivel off` / `nivel on` | Desliga e religa o sensor de nível |
| `estado` | Mostra o estado atual |
| `cair` | Desliga sem avisar, como numa queda de luz. O app mostra "Offline" |
| `sair` | Desliga avisando |

### 4.3 Desenvolvimento

Dois terminais:

```
cd server && pnpm dev      # API em http://localhost:3000, reinicia a cada mudança
cd web    && pnpm dev      # app em http://localhost:5173, com a API por proxy
```

O app abre na tela de login: toque em "Entrar como dev", que vem ligado fora do Docker.

Para guardar os dados entre reinícios, suba só o banco (`docker compose up -d mongo`) e descomente o `MONGO_URL` no `.env`.

| Para | Comando, em `server/` ou em `web/` |
|---|---|
| Testes, em modo watch | `pnpm test` |
| Testes, uma vez | `pnpm vitest run` |
| Tipos | `pnpm typecheck` |
| Lint e formatação | `pnpm lint` |

Os testes dos repositórios do MongoDB só rodam com o banco no ar (`docker compose up -d mongo`). Sem ele, aparecem como "skipped", e o resto roda normalmente.

## 5. O app

### 5.0 Comedouros

A primeira tela depois de entrar. Cada comedouro aparece com o apelido e o estado em palavras ("Tudo certo", "1 aviso", "Offline"); tocar num deles abre as quatro telas abaixo. Embaixo, **Adicionar comedouro**, **Pets**, **Notificações** (deste aparelho) e **Sua conta** (com o "Sair").

**Pets:** cada pet tem nome, espécie (gato ou cachorro), nascimento e peso, os dois opcionais, e uma foto. A foto é reduzida no próprio celular para 512 px antes de subir. A idade aparece calculada ("3 anos e 6 meses"). O pet é só um cadastro: ele não fica ligado a um comedouro, porque o comedouro não sabe quem comeu. Cada conta tem até 20 pets. Nas telas de um comedouro, o "‹ Comedouros", no topo, volta para cá.

### 5.1 Início

- **Servir agora:** escolha de 1 a 10 porções e toque no botão. Se o alimentador recusar, o motivo aparece embaixo.
- **Servir mesmo assim:** só aparece quando a recusa foi por ração na tigela. Ele ignora a tigela, mas **nunca** o limite diário nem o intervalo mínimo.
- **Hoje:** as porções servidas contra o limite do dia.
- **Garrafa:** o nível e para quantos dias dá, pela agenda atual.
- **Tigela:** o peso que a balança está lendo.
- **Próxima refeição** e **Última refeição.**
- **Online ou Offline:** se o servidor está em contato com o alimentador.
- **Alertas:** aparecem no topo. Os que não se resolvem sozinhos têm o botão "Entendi".

As recusas que o alimentador pode dar:

| Mensagem | Motivo | O que fazer |
|---|---|---|
| Limite de hoje atingido | O pedido passaria do limite diário | Esperar o dia seguinte, ou aumentar o limite em Ajustes |
| Ainda não deu o intervalo mínimo | Uma refeição saiu há pouco tempo | Esperar |
| A tigela ainda tem N g | A balança vê ração na tigela | Esperar o gato comer, ou "Servir mesmo assim" |
| O alimentador está ocupado | Ele está servindo | Tentar de novo em alguns segundos |
| O alimentador está parado | A última porção não saiu | Conferir a garrafa e a comporta, e tocar em "Entendi" |
| O alimentador está offline | Sem contato com o ESP32 | Conferir a energia e o Wi-Fi da placa |

### 5.2 Agenda

As refeições se repetem todos os dias. Cada uma tem um horário, de 1 a 10 porções e pode ser desativada sem ser apagada. Nada muda até você tocar em **Salvar agenda**.

O servidor recusa uma agenda que o alimentador não conseguiria cumprir:

| Regra | Exemplo recusado |
|---|---|
| No máximo 8 refeições | A 9ª |
| Sem horário repetido, ativa ou não | Duas às 07:30 |
| As refeições ativas não somam mais que o limite diário | Limite de 4, com 2 porções às 07:30 e 3 às 18:00 |
| As refeições ativas ficam separadas pelo intervalo mínimo, contando pela meia-noite | Intervalo de 60 min, com 07:30 e 08:00. Ou 23:50 e 00:10 |

Quando a recusa é pelo intervalo, a mensagem diz quais são os dois horários.

### 5.3 Histórico

Tudo o que o alimentador informou, por dia, do mais recente para o mais antigo: refeições servidas, pedidos recusados, refeições adiadas e puladas, problemas e reinícios.

### 5.4 Ajustes

| Campo | Padrão | Faixa aceita | Para que serve |
|---|---|---|---|
| Gramas por porção | 6 | maior que 0, até 30 | O peso de uma porção. Vem da calibração da dose |
| Limite diário | 10 porções | 1 a 30 | O máximo num dia, somando agenda, app e Alexa |
| Intervalo mínimo | 30 min | 15 a 720 | O tempo mínimo entre duas refeições |
| Limite da tigela | 10 g | 0 a 100 | Com mais que isso na tigela, não serve |
| Fuso horário | São Paulo | os 4 fusos do Brasil | O horário da agenda segue este fuso |
| Altura da garrafa | 230 mm | 50 a 500 | Para o sensor calcular o nível |
| Ângulo de encher | 0° | 0 a 180 | O servo com o bolso embaixo da garrafa |
| Ângulo de servir | 60° | 0 a 180, diferente do de encher | O servo com o bolso em cima do furo de saída |

Baixar o limite diário ou aumentar o intervalo mínimo também é recusado quando a agenda atual deixaria de caber. Ajuste a agenda antes.

**Manutenção** (exige o alimentador online e parado):

- **Tarar a balança:** com a tigela vazia e limpa no prato.
- **Calibrar com um peso:** ponha um peso conhecido no prato (um pacote fechado de 500 g serve) e informe o valor.
- **Soltar porções para pesar:** solta N porções sem contar no limite diário. Pese numa balança de cozinha, divida pelo número de porções e ponha o resultado em "Gramas por porção".
- **Testar ângulo:** move o servo até o ângulo digitado no campo, antes de salvar.

**Comedouro:** troca o apelido. No fim da tela, **Remover este comedouro** apaga a agenda, os ajustes, o histórico e a senha do aparelho, depois de uma confirmação.

**Sincronização:** no rodapé, "sincronizada" quer dizer que o ESP32 já aplicou a última configuração. "Ainda não aplicada" aparece enquanto ele está offline; ele recebe quando voltar.

### 5.5 Alertas

Cada problema avisa uma vez, e não a cada leitura.

| Alerta | Quando abre | Quando fecha |
|---|---|---|
| Ração acabando | Garrafa abaixo de 20% | Sozinho, ao reabastecer |
| A porção não saiu | O servo girou e a balança não viu ração | "Entendi", depois de conferir a garrafa e a comporta |
| Refeição pulada | A tigela ficou com ração por 2 h | "Entendi" |
| Sensor sem leitura | A balança ou o sensor de nível parou | Sozinho, quando o sensor volta |
| O alimentador reiniciou | A placa ligou (queda de luz?) | "Entendi" |
| Alimentador offline | Sem contato há mais de 30 min | Sozinho, quando ele volta |

## 6. No celular

Para instalar o app e receber notificações, o navegador exige **HTTPS**. A forma mais simples, sem abrir nenhuma porta do roteador, é o Tailscale: uma rede privada só entre os seus aparelhos.

### 6.1 HTTPS com Tailscale

1. Crie uma conta em tailscale.com e instale o Tailscale **na máquina do servidor** e **no celular**, com a mesma conta.
2. No painel do Tailscale, na página de DNS, ative o **MagicDNS** e os **certificados HTTPS**.
3. Na máquina do servidor, com o sistema no ar:
   ```
   tailscale serve --bg 3000
   ```
4. Rode `tailscale serve status`: ele mostra o endereço, no formato `https://nome-da-maquina.sua-rede.ts.net`.
5. Abra esse endereço no celular, com o Tailscale ligado. Funciona em casa e fora, pelo 4G.
6. Para entrar com o Google por ele, adicione o endereço às origens autorizadas do cliente OAuth (seção 3.5, passo 5).

Se o comando tiver mudado na sua versão, veja `tailscale serve --help`.

### 6.2 Instalar o app

- **Android (Chrome):** menu ⋮ → "Instalar app" ou "Adicionar à tela inicial".
- **iPhone (Safari):** botão Compartilhar → "Adicionar à Tela de Início".

### 6.3 Ativar as notificações

Com as chaves VAPID no `.env` (seção 3.3), abra o app pelo endereço HTTPS e, na tela inicial, toque em **Notificações → Ativar neste aparelho**. Depois, toque em "Enviar um teste".

No iPhone, as notificações só funcionam com o app **instalado na tela inicial** e no iOS 16.4 ou mais novo.

## 7. Ligar o ESP32 de verdade

1. Deixe o servidor no modo com broker (seção 3.1).
2. Descubra o IP da máquina do servidor na rede da casa e **reserve esse IP no roteador**: o ESP32 precisa achar o broker sempre no mesmo endereço.
3. Libere as portas **1883** e **3000** no firewall da máquina para a rede local.
4. No app, adicione um comedouro com o tipo **"Tenho um aparelho"**. Ligue a placa: ela abre a rede Wi-Fi "Comedouro". Conecte o celular nela e, na página que abrir, informe o Wi-Fi da casa, a senha dele, o endereço do servidor e o código que o app mostra. O passo a passo do lado da placa está no [protocolo](protocolo-mqtt.md), seção Pareamento.
5. O firmware segue o [protocolo MQTT](protocolo-mqtt.md). O simulador é a referência de comportamento.
6. Ligue a placa. No app, deve aparecer "Online" e, no rodapé de Ajustes, "sincronizada".

Para trocar a placa (ou o simulador por ela), use **Ajustes → Parear de novo**: o código novo troca a senha, e o aparelho antigo é derrubado. A agenda e os ajustes continuam.

## 8. Cópia de segurança

Na raiz do repo, com o sistema no ar:

```
docker compose exec -T mongo mongodump --archive --gzip --db comedouro > backup.gz
```

Para restaurar (substitui o que está no banco):

```
docker compose exec -T mongo mongorestore --archive --gzip --drop < backup.gz
```

Rode os dois num terminal Git Bash ou no `cmd`. O PowerShell pode corromper o arquivo ao redirecionar com `>`.

O backup não é automático. Se quiser um diário, agende o primeiro comando no Agendador de Tarefas do Windows.

## 9. Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| O servidor não sobe e o log fala em `MQTT_USERNAME` | O `.env` tem `MQTT_BROKER_PORT` sem usuário ou senha | Preencher os três |
| O app mostra "Simulado" e você queria o modo real | O `.env` está sem `MQTT_BROKER_PORT`, ou não foi aplicado | Conferir o `.env` e rodar `docker compose up -d` |
| "O servidor recusou o código" no simulador | Código errado, vencido (10 min) ou já usado | Gerar outro na tela do comedouro e rodar de novo |
| "Credencial recusada" no simulador | O comedouro foi removido, ou pareado em outro aparelho | Gerar um código (Ajustes → Parear de novo) e rodar com `SIM_CODIGO` |
| Pareamento responde 429 | 5 códigos errados do mesmo IP em 10 minutos | Esperar 10 minutos |
| "Offline" com a placa ligada | IP errado, firewall ou senha | Testar com o simulador em outra máquina da rede; conferir a seção 7 |
| "Configuração pendente" que não some | O dispositivo está offline, ou não devolve a versão no estado | Conferir o `configVersao` no estado do firmware |
| A porta 3000 ou 1883 já está em uso | Outro programa na mesma porta | Mudar o lado esquerdo do `ports` no `docker-compose.yml` |
| "Este navegador não recebe notificações" | A página não está em HTTPS, ou é um iPhone sem o app instalado | Seções 6.1 e 6.2 |
| O servidor está sem as chaves de notificação | Faltam as chaves VAPID | Seção 3.3 |
| A agenda não salva | Uma regra da seção 5.2 | A mensagem diz qual |
| O app abre, mas mostra "Sem conexão" | O celular não alcança o servidor | Conferir o Tailscale no celular e se o servidor está no ar |

## 10. A API

O app usa esta API, em `/v1`. Todas as rotas, menos as de `/v1/sessao`, exigem o cookie da sessão; sem ele, a resposta é 401.

| Método e rota | O que faz |
|---|---|
| `GET /v1/sessao/opcoes` | Quais botões a tela de login mostra: `{ "google": "<client id>" ou null, "dev": true/false }` |
| `POST /v1/sessao` | Entra com o Google. Corpo: `{ "credencial": "<ID token do Google>" }`. Devolve o usuário e o cookie `sessao` |
| `POST /v1/sessao/dev` | "Entrar como dev". Só existe com `DEV_LOGIN` ligado |
| `DELETE /v1/sessao` | Sai |
| `GET /v1/eu` | Quem está logado: `{ "id", "nome", "email", "foto" }` |


| Método e rota | O que faz |
|---|---|
| `GET /v1/comedouros` | Os comedouros da conta, com o estado de cada um, e se o servidor aceita aparelhos |
| `POST /v1/comedouros` | Cria um. Corpo: `{ "apelido": "Cozinha", "tipo": "simulado" }` ou `"aparelho"`. Para aparelho, devolve `codigo: { codigo, expiraEm }` |
| `GET` · `POST /v1/comedouros/:id/codigo` | O código de pareamento que ainda vale (ou `null`), ou um novo, que invalida o anterior |
| `POST /v1/dispositivos/parear` | **Sem sessão**: é o aparelho que chama. Corpo: `{ "codigo": "482913" }`. Detalhes no [protocolo](protocolo-mqtt.md) |
| `PATCH /v1/comedouros/:id` | Troca o apelido. Corpo: `{ "apelido": "Sala" }` |
| `DELETE /v1/comedouros/:id` | Remove o comedouro e todos os dados dele, e apaga a credencial do aparelho |
| `GET /v1/pets` · `POST /v1/pets` | Lista ou cadastra pets. Corpo: `{ "nome": "Mingau", "especie": "gato", "nascimento": "2023-05-10", "pesoKg": 4.2 }`; nascimento e peso podem ser `null` |
| `GET` · `PUT` · `DELETE /v1/pets/:id` | Lê, edita ou remove um pet (a foto vai junto) |
| `PUT /v1/pets/:id/foto` | Envia a foto: o corpo é a própria imagem, com `Content-Type: image/jpeg`, `image/png` ou `image/webp`, até 150 KB |
| `GET` · `DELETE /v1/pets/:id/foto` | Mostra ou apaga a foto. O pet traz o endereço dela em `foto`, com um `?v=` que muda a cada foto nova |
| `GET /v1/push/public-key` · `POST /v1/push/subscribe` · `POST /v1/push/unsubscribe` · `POST /v1/push/test` | Notificações deste aparelho, ligadas à conta |

As rotas abaixo são de um comedouro e começam com `/v1/comedouros/:id`. Comedouro de outra conta responde 404, igual a um que não existe.

| Método e rota | O que faz |
|---|---|
| `GET …/status` | O estado atual: apelido, online, hoje, tigela, garrafa, próxima refeição, alertas |
| `POST …/feed` | Serve agora. Corpo: `{ "porcoes": 1, "forcar": false }` |
| `GET …/schedules` · `PUT …/schedules` | Lê ou troca a agenda. Corpo do PUT: `[{ "hora": "07:30", "porcoes": 2, "ativo": true }]` |
| `GET …/config` · `PUT …/config` | Lê ou troca os ajustes |
| `GET …/history?limit=50` | O histórico. `limit` de 1 a 200 |
| `POST …/alerts/ack` | O "Entendi" |
| `POST …/scale/tare` | Tara a balança |
| `POST …/scale/calibrate` | Calibra a balança. Corpo: `{ "gramas": 500 }` |
| `POST …/calibrate` | Solta porções para pesar. Corpo: `{ "porcoes": 20 }` |
| `POST …/servo/test` | Move o servo. Corpo: `{ "angulo": 60 }` |
| `POST …/simulador` | Só nos comedouros simulados. Corpo: `{ "tigelaGramas": 30 }`, `{ "garrafaGramas": 100 }`, `{ "balanca": false }` |
| `GET /health` | `{ "status": "ok" }` |

| Status | Quando |
|---|---|
| 200, 201, 202 | Deu certo. O 202 é do "servir": o pedido foi aceito e está sendo executado |
| 400 | A forma do dado está errada: campo faltando, tipo errado |
| 401 | Sem sessão, sessão vencida, ou o Google não confirmou a credencial |
| 403 | O pedido veio de outro site (proteção contra CSRF) |
| 404 | O comedouro ou o pet não existe, ou é de outra conta |
| 413 | A foto passou de 150 KB |
| 429 | No pareamento: 5 códigos errados do mesmo IP em 10 minutos |
| 415 | A foto não é JPEG, PNG nem WebP |
| 409 | O alimentador está ocupado, ou duas edições ao mesmo tempo |
| 422 | Uma regra recusou. O corpo traz `motivo` e `mensagem` |
| 429 | O alimentador recusou o pedido de porção. O corpo traz o `motivo` |
| 503 | O alimentador está offline |

## 11. Limites conhecidos

- **Ainda não está pronto para a internet aberta.** Cada conta já tem os próprios comedouros, mas o broker MQTT ainda não usa TLS: a senha do aparelho passa em texto. Até a etapa P7 do [roteiro do produto](ROTEIRO-PRODUTO.md), use só na rede de casa e pelo Tailscale. **Nunca abra a porta 3000 nem a 1883 para a internet.**
- **Não testado com aparelhos de verdade:** a entrega das notificações push num celular, o acesso pelo Tailscale, a instalação no iPhone e a placa ESP32. O código dessas partes existe e tem testes automáticos até onde dá sem os aparelhos; a seção 12 mostra o que foi conferido.
- **Uma conexão MQTT do servidor por comedouro.** Para dezenas de comedouros, está bem; para milhares, o servidor precisaria de uma conexão só para todos.
- **Os dados de antes da P2 não aparecem.** O alimentador "principal" de quando o servidor tinha um comedouro só fica no banco, sem dono. Para recomeçar limpo: `docker compose down -v` (apaga o banco).
- **O backup não é automático** (seção 8).

## 12. O que foi testado

| Parte | Como |
|---|---|
| Regras da agenda e da configuração | Testes automáticos do domínio |
| A API inteira | Testes automáticos, sem abrir porta |
| A agenda do dispositivo simulado: adiar, pular, limite, virada do dia | Testes automáticos, com relógio controlado |
| Alertas: abrir, avisar uma vez, fechar | Testes automáticos |
| MongoDB | Os mesmos testes dos repositórios em memória, rodando contra um MongoDB de verdade |
| MQTT | Testes com um broker de verdade: configuração retida, servir, queda sem aviso, senha errada e histórico completado depois que o servidor volta |
| O app | Testes da lógica das telas, e conferência visual das quatro telas em tamanho de celular, nos temas claro e escuro |
| Docker | O compose inteiro, com o simulador conectado de fora e o servidor reiniciado no meio |
| Login | Testes automáticos (sessão, renovação, saída, 401, CSRF) e o servidor no ar com "Entrar como dev". O login com uma conta Google de verdade ainda não foi feito: depende do `GOOGLE_CLIENT_ID` |
| Pets | Testes automáticos (regras, limite, foto, 404 para os de outra conta) e o app de verdade no Chrome: o cadastro com foto escolhida pelo campo de arquivo, reduzida no navegador (uma imagem de 512 px chegou como JPEG de 11 KB) |
| Pareamento | Testes automáticos (código de uso único, vencimento, limite por IP, parear de novo) e o servidor no ar: o `pnpm simulador` pareou com o código mostrado no app, que mudou sozinho para o comedouro online; depois, um segundo pareamento derrubou o simulador, que apagou a senha guardada |
| Vários comedouros | Testes automáticos (cada conta só vê os seus, 404 para os de outra, limites, remoção) e o servidor no ar com o broker: o `pnpm simulador` entrou com a credencial do comedouro, serviu, e foi derrubado e recusado depois da remoção |

São 318 testes no servidor (27 deles precisam do MongoDB no ar) e 84 no app.
