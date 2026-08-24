# @store-mgmt/api-public

Anonymous, tenant-scoped read API for the public storefront (`web-catalog`).
No authentication anywhere in this app — the tenant is resolved from the
first label of the request `Host`/`X-Forwarded-Host` header
(`default.localhost:4903` → company slug `default`) by `PublicTenantGuard`,
which opens that tenant's Postgres schema for every read. The browser never
calls this app directly; `web-catalog` proxies server-to-server.

## Surface

| Route | Qué sirve |
|---|---|
| `GET /health` | Liveness + DB reachability |
| `GET /public/products` | Catálogo activo del tenant: filtros `?categoria=` `?search=`, orden `?orden=`, paginado |
| `GET /public/products/:id` | Detalle de producto (precio final derivado, badges) |
| `GET /public/products/:id/image/:key` | Bytes de imagen (stream, cache inmutable, nunca de productos inactivos ni cross-tenant) |
| `GET /public/categories` | Categorías del tenant |
| `GET /public/store` | Config pública de la tienda (brand/theme para el storefront) |

## Dev

```bash
PORT=4903 pnpm --filter @store-mgmt/api-public dev
curl -H "Host: default.localhost" http://localhost:4903/public/products
```

Requires `DATABASE_URL` (master schema; see `env.example`) and
`STORAGE_PATH` pointing at the SAME volume `api-salesops` writes uploaded
images to (`FsImageStore` — one writer, one reader).
