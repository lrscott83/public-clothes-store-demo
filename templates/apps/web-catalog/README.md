# @store-mgmt/web-catalog

Server-rendered (RR7 SSR) public storefront + per-tenant `/admin` + the
platform superadmin console. The tenant is the first label of the request
`Host` header; every backend call is server-to-server from a loader/action —
the browser never touches the APIs directly.

## Hosts

| Host | Superficie |
|---|---|
| `<slug>.localhost:3900` | Storefront público del tenant (`/`, `/productos`, `/productos/:id`) + su admin (`/admin/**`, login por sesión) |
| `admin.localhost:3900` | Consola de plataforma (superadmin): `/tiendas`, `/tiendas/nueva` — sin resolución de tenant; cualquier otra ruta redirige a `/tiendas` |
| `www` / `api` | Labels reservados — nunca son tenants |

El parser de host vive en `app/shared/lib/tenant.server.ts` y replica la
gramática de `api-public`'s `host-slug.ts` (mismos labels reservados).

## Dev

```bash
pnpm --filter @store-mgmt/web-catalog exec react-router dev --port 3900
# storefront:
curl -H "Host: default.localhost:3900" http://localhost:3900/productos
# consola plataforma:
curl -H "Host: admin.localhost:3900" http://localhost:3900/tiendas
```

Env vars (see `.env`, gitignored): `SESSION_SECRET`, `API_SALESOPS_URL`
(default `:3001`), `API_IDP_URL` (default `:3002`), `API_PUBLIC_URL`
(default `:3003`).

## Admin por tenant (`/admin`)

Login contra `api-idp` (`POST /auth/login`); la sesión guarda el token y el
guard resuelve `companyId` desde el subdominio (`X-Company-Id` hacia
`api-salesops`). CRUD de productos y categorías con upload/reemplazo/elimino
de imágenes (proxy resource route hacia `api-salesops`).

## Consola plataforma (`admin.<host>`)

Solo usuarios con `isSuperadmin` en master. Lista todas las compañías y crea
tiendas nuevas (nombre + slug + tipo `catalog`) componiendo la creación del
usuario dueño (login + contraseña temporal mostrada UNA sola vez) con el saga
de aprovisionamiento vía `POST /platform/companies` en `api-idp`.
