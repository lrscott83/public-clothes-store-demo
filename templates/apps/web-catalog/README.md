# web-catalog

Server-rendered (RR7 SSR) public storefront + `/admin`. The tenant is the
first label of the request `Host` (design.md §1/§2); the browser never calls
`api-public` directly — every backend call is server-to-server from a
loader/action.

**Phase 0 status**: bare scaffold. One route (`/`) with a loader that echoes
`request.headers.get('host')`, nothing else. Real tenant resolution,
`/productos`, and `/admin` land in Phases 5-6.

## Spike 0.1b — wildcard-subdomain Host header

**Question**: does `Host: default.localhost:3000` survive to this app's dev
server (and into a loader) with the header intact?

**Result: PASS, after one config fix.**

First run failed at Vite's dep-scanner/esbuild step — unrelated to the
`Host` header:

```
✘ [ERROR] No matching export in ".../react-router/dist/development/index.mjs"
  for import "UNSAFE_useRouteId" (via node_modules/react-router-dom/dist/index.js)
```

Root cause: this template is nested inside a legacy repo whose **root**
`node_modules` contains `react-router-dom@6`. Vite's dev dep-scanner
resolved a phantom `react-router-dom` import up into that root copy, whose
v6 internals reference `UNSAFE_*` exports that don't exist in
`react-router@7`. `apps/static-store/vite.config.ts` hit and fixed the same
issue; `apps/web-catalog/vite.config.ts` now carries the identical
`resolve.alias` (`react-router-dom` → `react-router`) — a config fix, not a
redesign.

With that fix, the Host-header proof passes:

```
$ curl -sv -H "Host: default.localhost:3000" http://localhost:3000/
> GET / HTTP/1.1
> Host: default.localhost:3000
< HTTP/1.1 200
< content-type: text/html
<p data-testid="host">Host: default.localhost:3000</p>
```

The loader's echoed value appears verbatim in the server-rendered HTML —
Vite's dev server did **not** need a `server.allowedHosts` change; it never
rejected the request in the first place. (Contrast with the design's
expectation that Vite might reject unrecognised hosts — empirically, this
version of Vite's dev server only enforces that check when `server.host` is
set to a specific value; ours is `host: true`.)

## Dev

```
pnpm --filter @store-mgmt/web-catalog dev
curl -H "Host: default.localhost:3000" http://localhost:3000/
```
