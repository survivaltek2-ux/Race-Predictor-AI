FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/horse-racing-ai/package.json ./artifacts/horse-racing-ai/

RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm rebuild esbuild

FROM base AS frontend-build
WORKDIR /app

COPY artifacts/horse-racing-ai/ ./artifacts/horse-racing-ai/
COPY lib/ ./lib/
COPY tsconfig.json ./

ENV BASE_PATH="/"
ENV NODE_ENV=production
RUN pnpm --filter @workspace/horse-racing-ai run build

FROM base AS backend-build
WORKDIR /app

COPY artifacts/api-server/ ./artifacts/api-server/
COPY lib/ ./lib/
COPY tsconfig.json ./

ENV NODE_ENV=production
RUN pnpm --filter @workspace/api-server run build

FROM node:24-slim AS production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/horse-racing-ai/package.json ./artifacts/horse-racing-ai/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY --from=backend-build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=frontend-build /app/artifacts/horse-racing-ai/dist/public ./artifacts/horse-racing-ai/dist/public

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["/app/docker-entrypoint.sh"]
