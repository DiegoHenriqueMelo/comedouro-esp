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

O servidor roda em três modos. Quem escolhe é o arquivo `.env` (seção 3).

| Modo | Para quê | O que precisa |
|---|---|---|
| **Demonstração** | Ver o app funcionando sem nenhuma peça | Nada. É o padrão sem `.env` |
| **Com o simulador** | Testar o caminho real (broker MQTT) sem a placa | `.env` com o broker, e o `pnpm simulador` rodando |
| **Com o ESP32** | O uso de verdade | `.env` com o broker, e a placa com o firmware |

## 2. Começar em 2 minutos (modo demonstração)

Você precisa do Docker Desktop aberto. Na raiz do repo:

```
docker compose up -d --build
```

Abra **http://localhost:3000**. O app aparece com a etiqueta "Simulado": um alimentador de mentira roda dentro do servidor. Dá para servir, montar a agenda e ver o histórico. Em **Ajustes → Simulador**, você põe ração na tigela ou esvazia a garrafa para ver as recusas e os avisos acontecerem.

Para parar: `docker compose down`. Os dados ficam guardados no volume do MongoDB.

**Sem Docker**, com Node 24 e pnpm:

```
cd web    && pnpm install && pnpm build
cd server && pnpm install && pnpm dev
```

Abra **http://localhost:3000**. Nesse caso, os dados ficam em memória e somem quando o servidor para.

## 3. Configuração

Copie o `.env.example` para `.env`, na raiz do repo, e preencha. O `.env` não vai para o git. Depois de mudar o `.env`, recrie o servidor: `docker compose up -d`.

### 3.1 Dispositivo

| Variável | Padrão | O que faz |
|---|---|---|
| `MQTT_BROKER_PORT` | vazia | Com um valor (use `1883`), o servidor abre um broker MQTT nessa porta. Sem ela, vale o modo demonstração |
| `MQTT_USERNAME` | vazia | O usuário que o ESP32 usa para conectar. Obrigatório com o broker |
| `MQTT_PASSWORD` | vazia | A senha. Obrigatória com o broker. Use uma senha de verdade |
| `MQTT_URL` | vazia | Para usar um broker que já existe (um Mosquitto, por exemplo), no lugar do embutido. Exemplo: `mqtt://192.168.0.10:1883` |
| `FEEDER_ID` | `principal` | O nome do alimentador nos tópicos MQTT. Tem que ser igual no ESP32 |

O mínimo para sair do modo demonstração:

```
MQTT_BROKER_PORT=1883
MQTT_USERNAME=comedouro
MQTT_PASSWORD=uma-senha-so-sua
```

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

```
cd server
pnpm install
pnpm simulador
```

Ele lê o mesmo `.env`. No app, a etiqueta "Simulado" some e aparece "Online". No terminal do simulador, dá para mexer no "mundo físico":

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

Para guardar os dados entre reinícios, suba só o banco (`docker compose up -d mongo`) e descomente o `MONGO_URL` no `.env`.

| Para | Comando, em `server/` ou em `web/` |
|---|---|
| Testes, em modo watch | `pnpm test` |
| Testes, uma vez | `pnpm vitest run` |
| Tipos | `pnpm typecheck` |
| Lint e formatação | `pnpm lint` |

Os testes dos repositórios do MongoDB só rodam com o banco no ar (`docker compose up -d mongo`). Sem ele, aparecem como "skipped", e o resto roda normalmente.

## 5. O app

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

**Notificações:** ativa ou desativa os avisos neste aparelho, e manda um aviso de teste.

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

Se o comando tiver mudado na sua versão, veja `tailscale serve --help`.

### 6.2 Instalar o app

- **Android (Chrome):** menu ⋮ → "Instalar app" ou "Adicionar à tela inicial".
- **iPhone (Safari):** botão Compartilhar → "Adicionar à Tela de Início".

### 6.3 Ativar as notificações

Com as chaves VAPID no `.env` (seção 3.3), abra o app pelo endereço HTTPS e vá em **Ajustes → Notificações → Ativar neste aparelho**. Depois, toque em "Enviar um teste".

No iPhone, as notificações só funcionam com o app **instalado na tela inicial** e no iOS 16.4 ou mais novo.

## 7. Ligar o ESP32 de verdade

1. Deixe o servidor no modo com broker (seção 3.1).
2. Descubra o IP da máquina do servidor na rede da casa e **reserve esse IP no roteador**: o ESP32 precisa achar o broker sempre no mesmo endereço.
3. Libere as portas **1883** e **3000** no firewall da máquina para a rede local.
4. No firmware, configure: o IP da máquina, a porta 1883, o usuário e a senha do `.env`, e o mesmo `FEEDER_ID`.
5. O firmware segue o [protocolo MQTT](protocolo-mqtt.md). O simulador é a referência de comportamento.
6. Ligue a placa. No app, deve aparecer "Online" e, no rodapé de Ajustes, "sincronizada".

Não rode o simulador e a placa ao mesmo tempo com o mesmo `FEEDER_ID`: os dois responderiam aos mesmos comandos.

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
| "Offline" com o simulador rodando | Senha, porta ou `FEEDER_ID` diferentes dos do servidor | O simulador lê o mesmo `.env`: conferir se ele está na raiz do repo |
| "Offline" com a placa ligada | IP errado, firewall ou senha | Testar com o simulador em outra máquina da rede; conferir a seção 7 |
| "Configuração pendente" que não some | O dispositivo está offline, ou não devolve a versão no estado | Conferir o `configVersao` no estado do firmware |
| A porta 3000 ou 1883 já está em uso | Outro programa na mesma porta | Mudar o lado esquerdo do `ports` no `docker-compose.yml` |
| "Este navegador não recebe notificações" | A página não está em HTTPS, ou é um iPhone sem o app instalado | Seções 6.1 e 6.2 |
| O servidor está sem as chaves de notificação | Faltam as chaves VAPID | Seção 3.3 |
| A agenda não salva | Uma regra da seção 5.2 | A mensagem diz qual |
| O app abre, mas mostra "Sem conexão" | O celular não alcança o servidor | Conferir o Tailscale no celular e se o servidor está no ar |

## 10. A API

O app usa esta API, em `/v1`. Ela não tem login (seção 11).

| Método e rota | O que faz |
|---|---|
| `GET /v1/status` | O estado atual: online, hoje, tigela, garrafa, próxima refeição, alertas |
| `POST /v1/feed` | Serve agora. Corpo: `{ "porcoes": 1, "forcar": false }` |
| `GET /v1/schedules` · `PUT /v1/schedules` | Lê ou troca a agenda. Corpo do PUT: `[{ "hora": "07:30", "porcoes": 2, "ativo": true }]` |
| `GET /v1/config` · `PUT /v1/config` | Lê ou troca os ajustes |
| `GET /v1/history?limit=50` | O histórico. `limit` de 1 a 200 |
| `POST /v1/alerts/ack` | O "Entendi" |
| `POST /v1/scale/tare` | Tara a balança |
| `POST /v1/scale/calibrate` | Calibra a balança. Corpo: `{ "gramas": 500 }` |
| `POST /v1/calibrate` | Solta porções para pesar. Corpo: `{ "porcoes": 20 }` |
| `POST /v1/servo/test` | Move o servo. Corpo: `{ "angulo": 60 }` |
| `GET /v1/push/public-key` · `POST /v1/push/subscribe` · `POST /v1/push/unsubscribe` · `POST /v1/push/test` | Notificações |
| `POST /v1/simulador` | Só no modo demonstração. Corpo: `{ "tigelaGramas": 30 }`, `{ "garrafaGramas": 100 }`, `{ "balanca": false }` |
| `GET /health` | `{ "status": "ok" }` |

| Status | Quando |
|---|---|
| 200, 201, 202 | Deu certo. O 202 é do "servir": o pedido foi aceito e está sendo executado |
| 400 | A forma do dado está errada: campo faltando, tipo errado |
| 409 | O alimentador está ocupado, ou duas edições ao mesmo tempo |
| 422 | Uma regra recusou. O corpo traz `motivo` e `mensagem` |
| 429 | O alimentador recusou o pedido de porção. O corpo traz o `motivo` |
| 503 | O alimentador está offline |

## 11. Limites conhecidos

- **A API não tem login.** Quem alcança a porta 3000 controla o alimentador. Use só na rede de casa e pelo Tailscale. **Nunca abra a porta 3000 nem a 1883 para a internet.**
- **O broker MQTT não usa TLS.** A senha passa em texto na rede da casa. Para um servidor na nuvem, seria preciso um broker com TLS.
- **Não testado com aparelhos de verdade:** a entrega das notificações push num celular, o acesso pelo Tailscale, a instalação no iPhone e a placa ESP32. O código dessas partes existe e tem testes automáticos até onde dá sem os aparelhos; a seção 12 mostra o que foi conferido.
- **Um alimentador só.** O sistema guarda um alimentador por servidor.
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

São 166 testes no servidor (14 deles precisam do MongoDB no ar) e 25 no app.
