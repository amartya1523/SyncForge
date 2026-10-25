# build context: repo root  (docker build -f apps/server/Dockerfile .)
FROM node:22-alpine
WORKDIR /app

# manifests first so the dependency layer is cached between code changes
COPY package.json package-lock.json ./
COPY packages/crdt/package.json packages/crdt/
COPY packages/sync/package.json packages/sync/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @syncforge/server --no-audit --no-fund

COPY packages/crdt packages/crdt
COPY packages/sync packages/sync
COPY apps/server apps/server

ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["npx", "tsx", "apps/server/src/main.ts"]
