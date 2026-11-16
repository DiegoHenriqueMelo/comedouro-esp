# comedouro-esp

Comedouro automático para pets: um ESP32 serve a ração pela agenda, e um app no celular acompanha e ajusta tudo.

O ESP32 decide cada porção sozinho: agenda, limite diário, intervalo mínimo e ração na tigela. O servidor guarda a configuração, o histórico e os avisos, e entrega o app. Com o servidor fora do ar, o gato continua comendo.

```
  Celular (PWA) ──HTTPS──► Servidor (Fastify) ──► MongoDB
                              │
                              │ MQTT (broker dentro do servidor)
                              ▼
                            ESP32 ──► servo, balança, sensor de nível
```

## O que tem

- **Contas** com login pelo Google. Cada pessoa vê só o que é dela.
- **Vários comedouros por conta**, cada um com apelido, agenda, ajustes, histórico e avisos próprios. Um comedouro novo entra na conta por um **código de pareamento** de 6 dígitos.
- **Comedouro simulado**, para experimentar o app sem nenhuma peça.
- **Pets**: nome, espécie, nascimento, peso e foto.
- **Avisos por notificação** no celular: ração acabando, porção que não saiu, comedouro offline e outros.

## Pastas

| Pasta | O que é |
|---|---|
| [`server/`](server) | Servidor Node 24 + TypeScript: Fastify, DDD, MongoDB, broker MQTT embutido (aedes) e notificações push. Testes com Vitest |
| [`web/`](web) | O app (PWA): React 19 + Vite. Em produção, o próprio servidor entrega o build |
| [`firmware/`](firmware) | O ESP32 (PlatformIO) |
| [`docs/`](docs) | Plano, roteiros, guia de uso, protocolo do firmware, glossário e guia de UI/UX |

## Começar em 2 minutos

Com o Docker Desktop aberto, na raiz do repo (o primeiro comando cria o `.env`; se você já tem um, só acrescente a linha `DEV_LOGIN=true` nele):

```
echo DEV_LOGIN=true > .env
docker compose up -d --build
```

Abra **http://localhost:3000**, toque em "Entrar como dev" e adicione um comedouro do tipo "Experimentar sem aparelho". O passo a passo completo, com o login pelo Google, o ESP32 e as notificações, está no [guia](docs/GUIA.md).

## Desenvolver

```
cd server && pnpm install && pnpm dev    # API em http://localhost:3000
cd web    && pnpm install && pnpm dev    # app em http://localhost:5173
```

| Para | Comando, em `server/` ou em `web/` |
|---|---|
| Testes | `pnpm vitest run` (os do MongoDB pedem `docker compose up -d mongo`) |
| Tipos | `pnpm typecheck` |
| Lint e formatação | `pnpm lint` |
| ESP32 de mentira | `SIM_CODIGO=<código> pnpm simulador`, em `server/` |

Commits em português, no padrão *conventional commits* com escopo: `feat(server): adicionando …`, `fix(web): …`, `docs: …`.

## Documentos

| Documento | Para quê |
|---|---|
| [GUIA.md](docs/GUIA.md) | Instalar, configurar e usar. Inclui a API |
| [protocolo-mqtt.md](docs/protocolo-mqtt.md) | O contrato do firmware: pareamento, tópicos e mensagens |
| [ROTEIRO-PRODUTO.md](docs/ROTEIRO-PRODUTO.md) | A fase atual: contas, vários comedouros, nuvem (P1–P7) e a parte do firmware (F1–F6) |
| [ROTEIRO-SISTEMA.md](docs/ROTEIRO-SISTEMA.md) | Como o servidor e o app foram construídos (E0–E13) |
| [PLANO-DE-ACAO.md](docs/PLANO-DE-ACAO.md) | O projeto inteiro: peças, eletrônica, mecânica, firmware e marcos |
| [glossario.md](docs/glossario.md) | Os termos e as regras do domínio (R1–R14) |
| [UI-UX.md](docs/UI-UX.md) | O guia visual que toda tela segue |
| [mentoria.md](docs/mentoria.md) | Como o Claude trabalha neste projeto |
