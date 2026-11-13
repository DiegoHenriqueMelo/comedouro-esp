# A imagem do sistema: o servidor Fastify já com o PWA dentro.
# Uso: `docker compose up -d --build` na raiz do repo (ver docs/GUIA.md).

FROM node:24-alpine AS base
RUN npm install -g pnpm@12.16.1

# 1. O PWA: gera web/dist.
FROM base AS web
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

# 2. O servidor: compila o TypeScript para server/dist.
FROM base AS server
WORKDIR /app/server
COPY server/package.json server/pnpm-lock.yaml server/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY server/ ./
RUN pnpm build

# 3. A imagem final: só o que roda em produção.
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/pnpm-lock.yaml server/pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY --from=server /app/server/dist ./dist
COPY --from=web /app/web/dist /app/web/dist

USER node
EXPOSE 3000 1883
CMD ["node", "dist/main.js"]
