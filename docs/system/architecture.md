# System architecture — store-mgmt (monorepo)

> **Authoritative** architecture document. Describes how the `store-mgmt` monorepo is
> organized and **where each thing goes**. It's a target: part already exists, part
> gets built module by module.
>
> **Read it before adding a new component** (domain module, infrastructure adapter,
> endpoint, app). If what you're about to create doesn't fit cleanly into this map,
> discuss the design first — don't improvise the location.
>
> Reference pattern, proven in production: sibling project **poolops-biz** (hexagonal
> + shared-kernel on pnpm/turbo). We adopt its pattern, adapted to our domain (we do
> not copy it).

## North star (the one rule that governs everything)

> **The domain doesn't know who calls it or where things are stored.**
> Pure business logic lives in **packages**. Delivery and wiring live in **apps**.
> Infrastructure details (DB, HTTP, external APIs) enter through **ports** the domain
> defines and adapters implement.

Every decision below follows from that rule. When in doubt about where something
goes, come back here.

## Packages vs Apps (the distinction that defines everything)

| | **package** | **app** |
|---|---|---|
| What it is | Reusable library | Deployable unit |
| Deploys on its own | No | Yes |
| Who consumes it | Apps and other packages | The end user / the infra |
| Contains | Domain, adapters, config, shared UI | Delivery + composition (wiring) |
| Depends on | Other packages | Packages (never another app) |
| Examples | `@store-mgmt/domain`, `@store-mgmt/web-common` | `@store-mgmt/salesops-mvp`, `@store-mgmt/static-store` |

**Corollary:** a **business module** (Currency, Sales, Inventory…) is ALWAYS a
package (or part of one), NEVER an app. Apps are thin, and there are few of them.

## Layer map

```
apps/                         ← DELIVERY + COMPOSITION (deployable, thin)
  salesops-mvp/               React Router 7 · organized by feature
  static-store/               React Router 7
        │ consumes (workspace:*)
        ▼
packages/
  domain/        @store-mgmt/domain      ← CORE: rules + entities + PORTS
  infra-*/       (future)                ← ADAPTERS: implement the ports
  web-common/    @store-mgmt/web-common  ← shared UI
  storefront/    @store-mgmt/storefront  ← store UI
  eslint-config/ typescript-config/      ← shared config + boundaries
```

Dependency direction: **apps → packages → domain**. The domain depends on nothing
outward. Never the other way around.

## Where does X go? (decision table)

Before creating a file, find the matching row:

| You're about to create… | It goes in… | Rule |
|---|---|---|
| Business entity / model | `packages/domain/src/<concept>/models` | Pure type, no framework/DB deps |
| Business rule / use case | `packages/domain/src/<concept>/` | Pure function `(input) => output`, tested |
| Repository interface (port) | `packages/domain/src/<concept>/` | `interface I<Name>Repository` — the contract only |
| Repository implementation (adapter) | `packages/infra-db/` (future) | `class … implements I<Name>Repository` |
| External-service adapter (API, geo, payments) | `packages/infra-<x>/` (future) | Implements the port the domain defines |
| Endpoint / controller / route | `apps/<app>/` (feature folder) | Delivery only: validate, call domain, respond |
| Shared UI component | `packages/web-common` or `storefront` | — |
| App-specific UI | `apps/<app>/app/components` | Not shareable → not a package |
| Cross-layer boundary rule | `packages/eslint-config` | It's **enforced**, not left to convention |

If your component doesn't fit any row → **stop and discuss the design first.**

## The domain: shared kernel by business concept

`@store-mgmt/domain` is **a single package** (shared kernel), organized **by business
concept**, not by technical layer. Screaming architecture: the folders shout WHAT the
business does, not how it's built.

```
packages/domain/src/
  index.ts               ← package public surface
  models/                ← base entities
  enums/
  currency/              ← Currency & Exchange Rate module (first)
    models.ts            entities (Currency, PaymentChannel, ExchangeRate…)
    resolver.ts          pure rate-resolution logic
    icurrency.repository.ts   ← PORT (interface)
  <next-module>/
```

**Why a single package and not one per module:** it's poolops-biz's decision,
validated. One package per bounded context gives hard boundaries but a lot of
boilerplate (package.json + tsconfig + build per module) for a small domain. The
shared kernel with per-concept subfolders gives the same conceptual boundaries at a
fraction of the cost. Boundaries between modules are kept by lint and the discipline
of the internal dependency graph, not by a separate build.

## Ports and adapters (the infrastructure boundary)

- **Port** = interface the **domain defines**. E.g. `ICurrencyRepository`. Lives in
  `packages/domain`. States WHAT the domain needs, not HOW.
- **Adapter** = class that **implements** that port against a concrete technology.
  E.g. `PrismaCurrencyRepository implements ICurrencyRepository`. Lives in
  `packages/infra-db` (or the relevant infra package).

The domain imports **the interface, never the implementation**. That lets you test
the domain without a DB and swap infrastructure without touching business rules.

> There are no `infra-*` packages yet because there's no real persistence (see
> current state). When it arrives, adapters go there — the domain doesn't change.

## Apps: thin delivery, organized by feature

An app has **no business logic**. It composes: it takes domain + infra packages,
wires them, and exposes delivery (UI or, later, HTTP). It's organized by **business
feature** (not by `controllers/`, `services/`… technical layers):

```
apps/salesops-mvp/app/
  routes/          ← delivery (one feature per route)
  components/      ← app's own UI
  domain/          ← ⚠️ TRANSITIONAL — lives here today, migrates to packages/domain
  store/           ← persistence seam (localStorage today)
```

Rule: if a piece of logic serves more than one app, or is pure business logic
testable without UI → **it doesn't go in the app, it goes in `packages/domain`.**

## Boundaries: enforced, not requested politely

Boundaries between layers are codified in `packages/eslint-config` (following
poolops-biz's `backend-boundaries` pattern), for example:

- A web app cannot import backend-only packages.
- The domain cannot import from `infra-*` or from apps.

A boundary that lives only in a doc breaks on its own. If you define a new
architecture rule, add the lint that enforces it.

## Current state vs. target (honesty)

| Piece | Today | Target |
|---|---|---|
| `@store-mgmt/domain` | Exists (`models/`, `enums/`), builds to `dist/` | Core with per-concept modules + ports |
| salesops-mvp domain | Lives **inside the app** (`app/domain/`) | Migrated to `packages/domain` |
| salesops-mvp → domain | **Does not consume it** yet | `dependency: @store-mgmt/domain` |
| Persistence | `localStorage` (`app/store/seed-store.ts`) — the **seam** | Adapter in `packages/infra-db` behind a port |
| `infra-*` packages | Do not exist | Created when real persistence lands |
| HTTP backend | Does not exist (client-side SPA) | Thin `api-*` app(s), if/when needed |

Migration is **incremental, module by module**, without rewriting the UI. The seam
(`seed-store.ts`) is the point where the seed gets replaced by real modules. See
[estrategia-backend-por-modulos.md](../plans/estrategia-backend-por-modulos.md).

> **STALE (flagged, not fixed — SDD change `multi-tenant-by-schema`, task 14.4,
> design.md §5):** the table above says "HTTP backend: does not exist" and lists
> no `infra-*`/`api-*` packages. Both are now false — `packages/infra-db`,
> `packages/api-common`, `apps/api-idp`, and `apps/api-salesops` all exist and
> are the backend of record. Rewriting this table is out of scope for that
> change; this note exists so the gap is visible rather than silently stale.

## Checklist: adding a new component

- [ ] I found the row in **Where does X go?** — I know if it's a package or an app.
- [ ] If it's business logic: it's a **pure function/type**, no framework/DB imports.
- [ ] If it touches the outside world (DB/API): I defined the **port** in `domain` and
      the **adapter** in `infra-*`. The domain imports the interface, not the impl.
- [ ] If it's a new module: it goes as a **per-concept subfolder** in
      `packages/domain`, not as a new package or app (unless explicitly decided).
- [ ] If I introduced a boundary rule: I reflected it in `eslint-config`.
- [ ] The dependency graph still points **apps → packages → domain**.
- [ ] Nothing new inside `apps/*/app/domain` (that folder is being emptied).

If any item doesn't hold → discuss the design before writing code.

## References

- Backend strategy by modules: [estrategia-backend-por-modulos.md](../plans/estrategia-backend-por-modulos.md)
- Development strategy by modules: [estrategia-desarrollo-modulos.md](../plans/estrategia-desarrollo-modulos.md)
- Currency & Exchange Rate module design: [monedas-tasas-cambio-design.md](../plans/monedas-tasas-cambio-design.md)
- Reference pattern (sibling project): `poolops-biz` — hexagonal shared-kernel,
  `@poolops/domain` (ports) + `@poolops/infra-db` (adapters) + thin NestJS apps.
