FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
# Generate engines inside the target OS, never copy the host's Prisma client.
# This disposable URL is used for schema generation only; no connection is made.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build pnpm db:generate && CATALOG_STORAGE=snapshot pnpm build

# A separate deployment identity supplies DATABASE_URL at invocation time.
FROM builder AS migrate
ENV NODE_ENV=production
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM builder AS worker
ENV NODE_ENV=production
USER node
CMD ["node", "--import", "tsx", "scripts/deadline-worker.ts"]

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
