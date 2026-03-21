FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/graph-builder/package.json ./packages/graph-builder/
COPY packages/analyzer/package.json      ./packages/analyzer/
COPY packages/deployers/package.json     ./packages/deployers/
COPY packages/scanner/package.json       ./packages/scanner/
COPY packages/ai/package.json            ./packages/ai/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages/graph-builder/src           ./packages/graph-builder/src
COPY packages/graph-builder/tsconfig.json ./packages/graph-builder/tsconfig.json
COPY packages/analyzer/src                ./packages/analyzer/src
COPY packages/analyzer/tsconfig.json      ./packages/analyzer/tsconfig.json
COPY packages/deployers/src               ./packages/deployers/src
COPY packages/deployers/tsconfig.json     ./packages/deployers/tsconfig.json
COPY packages/scanner/src                 ./packages/scanner/src
COPY packages/scanner/tsconfig.json       ./packages/scanner/tsconfig.json
RUN pnpm build --filter @archmap/analyzer --filter @archmap/graph-builder --filter @archmap/deployers

FROM base AS runner
WORKDIR /app
COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/packages      ./packages
COPY package.json pnpm-workspace.yaml  ./
ENV OUTPUT_DIR=/data
ENV DEPLOYER=files
VOLUME /data
CMD ["node_modules/.bin/tsx", "packages/scanner/src/index.ts"]
