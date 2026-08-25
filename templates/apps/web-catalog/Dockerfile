# web-catalog — React Router v7 SSR app. Multi-stage build from the monorepo
# root (the pnpm lockfile and workspace definition live there), so the build
# context is templates/ (see docker-compose.yml).
#
# `react-router build` produces everything needed at runtime under build/
# (client assets + server bundle); no `.react-router` typegen is required.

# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable

# ---- deps: install the exact lockfile tree (workspace-aware) --------------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# pnpm requires every importer referenced in the lockfile to exist, so copy
# all workspace package.json files before installing.
COPY apps/api-idp/package.json apps/api-idp/
COPY apps/api-public/package.json apps/api-public/
COPY apps/api-salesops/package.json apps/api-salesops/
COPY apps/salesops-mvp/package.json apps/salesops-mvp/
COPY apps/static-store/package.json apps/static-store/
COPY apps/web-catalog/package.json apps/web-catalog/
COPY packages/api-common/package.json packages/api-common/
COPY packages/domain/package.json packages/domain/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/infra-db/package.json packages/infra-db/
COPY packages/infra-storage/package.json packages/infra-storage/
COPY packages/storefront/package.json packages/storefront/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/web-common/package.json packages/web-common/
RUN pnpm install --frozen-lockfile

# ---- build: compile the target app and its workspace dependencies ---------
FROM deps AS build
WORKDIR /app
COPY . .
# turbo resolves the ^build dependency chain (@store-mgmt/web-common...)
# automatically; no need to list them.
RUN pnpm exec turbo run build --filter=@store-mgmt/web-catalog

# ---- runtime: node + built output + installed dependencies -----------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/web-catalog/package.json ./apps/web-catalog/package.json
COPY --from=build /app/apps/web-catalog/node_modules ./apps/web-catalog/node_modules
COPY --from=build /app/apps/web-catalog/build ./apps/web-catalog/build
WORKDIR /app/apps/web-catalog
EXPOSE 3000
CMD ["./node_modules/.bin/react-router-serve", "./build/server/index.js"]
