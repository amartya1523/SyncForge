# build context: repo root  (docker build -f apps/web/Dockerfile .)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/crdt/package.json packages/crdt/
COPY packages/sync/package.json packages/sync/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @syncforge/web --no-audit --no-fund
COPY packages/crdt packages/crdt
COPY packages/sync packages/sync
COPY apps/web apps/web
# baked into the client bundle at build time
ARG NEXT_PUBLIC_SYNC_URL=http://localhost:4000
ENV NEXT_PUBLIC_SYNC_URL=$NEXT_PUBLIC_SYNC_URL
RUN npm run build --workspace @syncforge/web

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@syncforge/web"]
