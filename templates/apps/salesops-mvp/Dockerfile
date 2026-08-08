# Multi-stage build for the salesops-mvp React Router SPA served behind HAProxy
# on nova.playground.sceiba.net. Stage 1 builds the static client from the pnpm
# monorepo; stage 2 serves it with nginx. Pure frontend — react-router.config.ts
# sets ssr:false, so there is NO server runtime and NO /api proxy.
#
# Build context MUST be the monorepo root (templates/) so pnpm can resolve the
# workspace packages (@store-mgmt/storefront, @store-mgmt/web-common, …):
#   podman build -f apps/salesops-mvp/Dockerfile -t localhost/nova_salesops:latest .

# --- Build stage --------------------------------------------------------------
FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app
COPY . .
# Build salesops-mvp AND its workspace deps in dependency order — the `...`
# suffix selects the package plus everything it depends on.
RUN pnpm install --frozen-lockfile \
 && pnpm --filter "@store-mgmt/salesops-mvp..." build

# --- Serve stage --------------------------------------------------------------
FROM nginx:alpine
COPY apps/salesops-mvp/deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/salesops-mvp/build/client /usr/share/nginx/html
EXPOSE 80
