# Build context is the repository root (see docker-compose.yml).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install only what the server needs. All workspace manifests are copied so the lockfile resolves.
COPY package.json package-lock.json ./
COPY packages/game-core/package.json packages/game-core/
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --omit=dev -w @bombarossa/server

COPY packages/game-core/src packages/game-core/src
COPY apps/server/src apps/server/src

USER node
EXPOSE 8080
CMD ["node_modules/.bin/tsx", "apps/server/src/index.ts"]
