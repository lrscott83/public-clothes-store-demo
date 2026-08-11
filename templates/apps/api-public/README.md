# api-public

Anonymous, tenant-scoped read API for the public storefront (`web-catalog`).
No authentication anywhere in this app — see design.md D3.

**Phase 0 status**: bare scaffold. `GET /health` returns a literal
`{ status: 'ok' }`, no DB, no tenant resolution. Everything else
(`host-slug`, `PublicTenantGuard`, product/category/store endpoints) lands
in Phase 4.

## Spike 0.1b — wildcard-subdomain Host header

**Question**: does `Host: default.localhost:3000` survive to this app's dev
server with the header intact?

**Result: PASS, no config fix needed.**

```
$ curl -sv -H "Host: default.localhost:3000" http://localhost:3003/health
> GET /health HTTP/1.1
> Host: default.localhost:3000
< HTTP/1.1 200 OK
< Content-Type: application/json; charset=utf-8
{"status":"ok"}
```

NestJS's underlying Express adapter does not validate the `Host` header by
default — unlike Vite's dev server (see `apps/web-catalog/README.md`), there
is nothing here to allow-list. Any arbitrary `Host` value reaches the
handler unchanged.

## Dev

```
PORT=3003 pnpm --filter @store-mgmt/api-public dev
```
