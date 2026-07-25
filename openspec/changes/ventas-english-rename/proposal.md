# Proposal: ventas-english-rename — translate the Ventas/Currency backend surface to English

## Intent

The repo convention is **English identifiers, Spanish UI** (`conventions/lang-english-code-spanish-ui`,
established with `backend-users-roles`, precedent in `packages/domain/src/users/roles.ts` →
`ROLE_LABELS_ES` consumed by `apps/api-idp/src/auth/mappers/user.mapper.ts`). The Ventas slice
(SDD change `backend-ventas`, archived `2026-07-22`) predates that convention and is the last
backend area still carrying Spanish identifiers: three enum value sets, one folder name in each
of the three layers, three NestJS class names, and four Currency function/param names.

**This change is a pure identifier + label rename. ZERO behavior change.** No new business rule,
no changed invariant, no changed control flow, no changed HTTP route (`@Controller('orders')`
stays). Every diff line is either a renamed identifier, a renamed enum label, an updated doc
comment, an updated test literal, or the additive Spanish-label lookup (block H). If a reviewer
finds a semantic delta in this change, that is a bug, not intent.

Naming is **owner-LOCKED** in Engram `sdd/ventas-english-rename/naming-decisions` (#1529),
approved block-by-block on 2026-07-25. This proposal formalizes and sequences those decisions;
it does not re-open them.

**Why now**: the `ventas` follow-up **W5** (`docs/plans/ventas-follow-ups-pendientes.md` —
allow 100%-credit sales) is still undone and will edit `order.ts:133-141`, immediately adjacent
to the `OrderStatus` transition block. Landing the rename first turns W5 into a clean diff
instead of an overlapping one.

**Success** = every Spanish identifier in blocks A–H is gone from the backend, the Postgres enum
labels are renamed in place with no data loss and no reseed, and the full test matrix (domain
vitest + infra-db jest vs real Postgres + api-salesops unit + e2e) is green at every commit.

## Scope

### In Scope — the 8 owner-approved blocks

**A — `OrderStatus` values** (`schema.prisma:227-231`)

| Spanish | English |
|---|---|
| `creado` | `created` |
| `verificado` | `verified` |
| `entregado` | `delivered` |
| `cancelado` | `cancelled` (2 L's — repo already uses `cancelled` 9×) |

**B — `DeliveryMode` values** (`schema.prisma:234-236`)

| Spanish | English |
|---|---|
| `recogida` | `pickup` |
| `domicilio` | `delivery` |

Required mitigation (agreed): add an explicit comment on the `DeliveryMode` type definition
stating that `deliveryMode` and `status` are **independent axes** — a `pickup` order still
reaches `status: 'delivered'`.

**C — `PaymentChannel` values (IN SCOPE)** (`schema.prisma:16-21`)

| Spanish | English |
|---|---|
| `USD_EFECTIVO` | `USD_CASH` |
| `EUR_EFECTIVO` | `EUR_CASH` |
| `MN_EFECTIVO` | `MN_CASH` |
| `MN_TRANSFERENCIA` | `MN_TRANSFER` |
| `ZELLE` | unchanged |

Same enum type also backs `order_line.rate_channel`, `order_payment.rate_channel`,
`sale_credit.rate_channel`, `order_payment.channel`, `exchange_rate.channel` — all covered by
one `ALTER TYPE` statement.

**D — Folders** — `ventas/` → `sales/` in all three layers
(`packages/domain/src/`, `packages/infra-db/src/`, `apps/api-salesops/src/`).
Rationale (locked): `sales` is the **bounded context**, `Order` is the **aggregate** inside it —
the table is already `sales_order`, `sale-credit.ts` already lives there and is not an Order, and
the deferred returns flow (`docs/plans/ventas-devoluciones-flujo-diferido.md`) will add another
aggregate to the same context.

**E — Classes / files (api-salesops only — domain and infra-db filenames are already English)**

| Current | New | File |
|---|---|---|
| `VentasController` | `OrderController` | `order.controller.ts` |
| `VentasService` | `OrderService` | `order.service.ts` |
| `VentasModule` | `SalesModule` | `sales.module.ts` |
| field `ventasService` | `orderService` | — |
| spec var `ventasController` | `orderController` | — |
| `ventas.controller.spec.ts` / `ventas.service.spec.ts` | `order.controller.spec.ts` / `order.service.spec.ts` | — |
| `test/ventas.e2e-spec.ts` | `test/order.e2e-spec.ts` | — |

Module carries the CONTEXT name; controller/service carry the AGGREGATE name.
**`@Controller('orders')` is UNCHANGED — D and E have zero wire impact.**

**F — Seed (infra-db)**

- `VENTAS_SEED_NAMESPACE` → `SALES_SEED_NAMESPACE` — **variable name only**; its value is a UUID
  constant (`3f0a6c9e-…`), unchanged → zero data impact.
- `DEMO_CATEGORY_SLUG` `'ventas-seed-demo'` → `'sales-seed-demo'` — this **IS persisted data** and
  the upsert lookup key (`seed.ts:75-78`). The migration MUST carry
  `UPDATE "category" SET slug = 'sales-seed-demo' WHERE slug = 'ventas-seed-demo';`
  or the next seed run creates a duplicate category and orphans the old one with its products.
- Category **display name `'Ventas Demo'` STAYS Spanish** — user-facing text.
- The `deterministicId` keys are already English (`'product:usd'`, `'order:single-currency'`,
  `'sale-credit:credit-sale'`) — nothing to do there.

**G — Currency module (IN SCOPE)** — `packages/domain/src/currency/rate-resolver.ts` + call sites

| Current | New |
|---|---|
| `resolverTasa` | `resolveRate` (sibling of existing `resolveRateForCurrency`) |
| `convertir` | `convert` |
| `convertirEntreMonedas` | `convertBetweenCurrencies` |
| param `origen: Money` | `source` (**not** `from` — the DTO already uses `input.from` as a currency STRING) |
| param `monedaDestino` | `targetCurrency` |
| local `destinoMinorUnits` | `targetMinorUnits` |
| local `origen` (`currency.service.ts:59`) | `source` |

Rest of `rate-resolver.ts` is already English (`resolveRateForCurrency`, `syntheticIdentity`,
`divRoundHalfUp`, `originResolved`).

**H — Spanish labels (ADDITIVE — not a rename)**

- New `packages/domain/src/sales/labels.ts`: `ORDER_STATUS_LABELS_ES`, `DELIVERY_MODE_LABELS_ES`.
- `PAYMENT_CHANNEL_LABELS_ES` in `packages/domain/src/currency/payment-channel.ts` beside
  `CHANNEL_CURRENCY`.
- `statusLabel` / `deliveryModeLabel` fields on `OrderResponseDto`, computed in `OrderService`.
- Shape mirrors `ROLE_LABELS_ES` / `RoleHelpers` exactly.
- Values (neutral LatAm Spanish, `conventions/ui-spanish-latam-neutral`): `created`=Creado,
  `verified`=Verificado, `delivered`=Entregado, `cancelled`=Cancelado, `pickup`=«Recogida en
  tienda», `delivery`=«Envío a domicilio», `ZELLE`=Zelle, `USD_CASH`=«USD en efectivo»,
  `EUR_CASH`=«EUR en efectivo», `MN_CASH`=«MN en efectivo», `MN_TRANSFER`=«Transferencia en MN».

### In Scope — mechanical follow-through (derived from A–H, no new decisions)

- `packages/infra-db/prisma/schema.prisma` enum blocks + one new hand-written migration.
- All test literals across domain / infra-db / api-salesops (this is the bulk of the diff volume).
- `openspec/specs/salesops-ventas/spec.md` — update only the requirement text that **quotes the
  literal enum values** (66 occurrences). Spanish prose stays Spanish; this is an accuracy fix,
  not a translation.
- `docs/plans/ventas-follow-ups-pendientes.md` / `ventas-devoluciones-flujo-diferido.md` — same
  treatment: fix quoted enum literals only, leave the Spanish planning prose alone.

### Explicitly OUT OF SCOPE

- **`apps/salesops-mvp`'s entire Spanish prototype surface** (`Gestor`, `Transportista`,
  `comision_pagada`, `zona`, `pedidos-nuevo`, `decisiones`, `finanzas` — 30+ files). It is a
  disconnected localStorage prototype with its OWN richer `OrderState`
  (`'creado' | 'verificado' | 'transportando' | 'entregado' | 'comision_pagada'`) and its own
  `deliveryMode?: 'domicilio' | 'recogida'` on `Client`. **It does NOT call the backend API**
  (verified: zero `fetch` / `axios` / `API_URL` in `app/`). Renaming there requires first deciding
  whether that model survives being wired to the real backend — that is design, not translation.
  Blast radius of this change on `salesops-mvp` today: **zero**.
- Already-applied migration files. Their comments mention `creado`/`verificado` — they stay as
  historical record (see Risks: checksum drift).
- Any behavior change, including W5 (100%-credit sales).

## Approach — ordered work-unit commits

Delivery is **single branch, work-unit commits, push at end, NO pull request**. Conventional
commits, no AI attribution. Every commit must leave **build + full test matrix green**.

Proposed branch: **`salesops-rename-ventas`**, cut from current `salesops-users` @ `163cd7d`.
**Needs owner confirmation before W1.**

### W1 — Domain enums + `schema.prisma` + hand-written migration (ATOMIC — do not split)

Blocks **A + B + C** (domain-side types and literals) **and** the Prisma schema **and** the
migration land in **one commit**. They are coupled in both directions: infra-db's TypeScript will
not compile against the new domain enum values until the Prisma client is regenerated to match,
and the Prisma client cannot match until `schema.prisma` is updated. Splitting leaves a genuinely
red build in between.

Contents:
- `packages/domain/src/ventas/order.ts` — `OrderStatus` + `DeliveryMode` type defs, the 5 literal
  comparisons in `createOrder`/`confirmOrder`/`deliverOrder`/`cancelOrder`, doc comments, **plus
  the block-B independence comment on `DeliveryMode`**.
- `packages/domain/src/ventas/order-repository.port.ts`, `errors.ts` — doc comments.
- `packages/domain/src/currency/payment-channel.ts` — `PaymentChannel` type + `CHANNEL_CURRENCY`.
- All domain tests (`order.test.ts` ~22 hits, `payment-channel.test.ts` ~11,
  `rate-resolver.test.ts` ~37).
- `schema.prisma:16-21`, `:227-231`, `:234-236` + surrounding narrative comments.
- New migration `packages/infra-db/prisma/migrations/<ts>_rename_spanish_enums_to_english/migration.sql`.

**The migration is HAND-WRITTEN.** Prisma does NOT generate `RENAME VALUE`; its auto-diff models
an enum value rename as remove+add, implemented as DROP TYPE / re-CREATE TYPE — destructive, and
it fails outright while rows reference the old value (prisma/prisma#23569, prisma/migrate#614).
Hand-authored migrations with reasoning comments are already this repo's style (see
`20260723010000_order_drop_active_never_deletable`).

```sql
ALTER TYPE "OrderStatus"    RENAME VALUE 'creado'           TO 'created';
ALTER TYPE "OrderStatus"    RENAME VALUE 'verificado'       TO 'verified';
ALTER TYPE "OrderStatus"    RENAME VALUE 'entregado'        TO 'delivered';
ALTER TYPE "OrderStatus"    RENAME VALUE 'cancelado'        TO 'cancelled';

ALTER TYPE "DeliveryMode"   RENAME VALUE 'recogida'         TO 'pickup';
ALTER TYPE "DeliveryMode"   RENAME VALUE 'domicilio'        TO 'delivery';

ALTER TYPE "PaymentChannel" RENAME VALUE 'USD_EFECTIVO'     TO 'USD_CASH';
ALTER TYPE "PaymentChannel" RENAME VALUE 'EUR_EFECTIVO'     TO 'EUR_CASH';
ALTER TYPE "PaymentChannel" RENAME VALUE 'MN_EFECTIVO'      TO 'MN_CASH';
ALTER TYPE "PaymentChannel" RENAME VALUE 'MN_TRANSFERENCIA' TO 'MN_TRANSFER';

-- Block F: DEMO_CATEGORY_SLUG is the seed's upsert lookup key. Without this the
-- next seed run creates a duplicate category and orphans the old one + its products.
UPDATE "category" SET slug = 'sales-seed-demo' WHERE slug = 'ventas-seed-demo';
```

Why this is safe: Postgres stores enum values by internal OID, not label text, so
`ALTER TYPE … RENAME VALUE` (PG10+) renames the label in place — no row rewrite, no backfill, no
reseed, works with existing data. Unlike `ADD VALUE`, `RENAME VALUE` is transaction-safe, so
Prisma's wrapping transaction is fine. No CHECK constraints, generated columns, or functional
indexes reference these enums (verified across all migration SQL); the only indexes involved
(`@@index([customerId])`, `@@index([channel, effectiveFrom])`) are column-based and unaffected.

Post-edit gate:
1. `prisma migrate dev --create-only` → Prisma's diff MUST be a **no-op**. If it still wants to
   generate a destructive diff, `schema.prisma` and the hand-written SQL disagree — reconcile
   before applying. Delete the empty generated migration if one is produced.
2. `prisma generate` → regenerate the client so the TS enum types match.
3. Do **not** use `@map` on enum values as a shortcut — active Prisma v7 regression
   (prisma/prisma#28843).

### W2 — infra-db repository + seed (block F)

`prisma-order.repository.ts` (11 literal status guards at `:342-414`), `seed.ts` (13 hits:
status + `deliveryMode` literals across 4 seeded orders, `VENTAS_SEED_NAMESPACE` →
`SALES_SEED_NAMESPACE`, `DEMO_CATEGORY_SLUG`), `prisma-order.repository.spec.ts` (~25),
`seed.spec.ts` (~6).

**This is the first REAL end-to-end proof that the migration works** — infra-db jest runs against
a real migrated Postgres.

### W3 — api-salesops delivery layer

`ventas.service.ts:108` (the one literal `status !== 'creado'` guard), doc comments in
controller/service/module, `create-order.dto.ts:33` comment, unit specs (~18 each), and the e2e
spec (~29 hits — heaviest single file). `assertCurrency`/`assertChannel`
(`ventas.controller.ts:47-58`) enumerate channels via `Object.keys(CHANNEL_CURRENCY)` and pick up
the renamed values with **no code change**.

Requires `pnpm build` of `domain` + `infra-db` first — e2e runs against the built `dist`.

### W4 — Currency function/param renames (block G)

Pure TypeScript, no DB coupling. `rate-resolver.ts` definitions + call sites in `order.ts:5`,
`order-payment.ts:6`, `currency.service.ts:59`, plus `rate-resolver.test.ts` and the currency
service/controller specs. Kept out of W1 so the atomic DB-coupled commit stays focused.

### W5 — Spanish labels (block H — additive)

New `labels.ts`, `PAYMENT_CHANNEL_LABELS_ES`, `OrderResponseDto` fields, `OrderService` mapping.
Purely additive, zero rename risk. Strict TDD applies cleanly here (real RED→GREEN, not
literal-swap RED).

**Ordering note**: block H specifies `packages/domain/src/sales/labels.ts`, but the folder rename
(block D) lands in W6. Create the file at `packages/domain/src/ventas/labels.ts` in W5 and let W6
move it with the rest of the folder — the end state matches the locked decision either way. The
alternative (pull D forward before H) is also valid; do NOT create a `sales/` folder alongside a
still-existing `ventas/` folder.

### W6 — Folder + class rename (blocks D + E)

Mechanical. Runs last so git records **pure renames** on files whose content already stabilized,
keeping `git log --follow` and the diff readable. Cross-layer coupling is minimal and verified:
only `packages/domain/src/index.ts:10`, `packages/infra-db/src/index.ts:11`, and
`apps/api-salesops/src/app.module.ts:11` reference the folder across a package boundary —
everything else is intra-package relative imports.

### W7 — Spec + docs literal sweep

`openspec/specs/salesops-ventas/spec.md` (66 enum-literal occurrences) and the quoted literals in
the two `docs/plans/ventas-*.md` files. Spec describes shipped behavior, so it lands after the
code. May alternatively be folded into `sdd-archive` — owner's call.

## Verification plan

Run **all pnpm commands from `templates/`**, never the repo root.

| # | Proves | Command / check | Notes |
|---|---|---|---|
| 1 | A, B, C (domain types + invariants), G | `pnpm --filter @store-mgmt/domain test` (vitest) | Fast inner loop; must be green before touching infra-db |
| 2 | Migration actually renamed the PG labels | `psql`: `SELECT unnest(enum_range(NULL::"OrderStatus"))` (and `DeliveryMode`, `PaymentChannel`) | Direct proof, independent of ORM caching |
| 3 | Prisma schema ↔ migration agreement | `prisma migrate dev --create-only` produces a **no-op** diff | Gate before `prisma generate` |
| 4 | A, B, C at the persistence boundary + F | `pnpm --filter @store-mgmt/infra-db test` (jest, REAL Postgres) | Uses `NODE_OPTIONS=--experimental-vm-modules`; bare `npx jest` FAILS |
| 5 | F slug data migration | `seed.spec.ts` idempotency + `SELECT slug, count(*) FROM category GROUP BY slug` → exactly one `sales-seed-demo`, zero `ventas-seed-demo` | The duplicate-category failure mode |
| 6 | Delivery layer wiring | `pnpm build` (domain + infra-db) → `pnpm --filter api-salesops test` | Build first — non-negotiable ordering |
| 7 | Wire contract (A, B, C over HTTP) + H | `pnpm --filter api-salesops test:e2e` (real Postgres, runs against BUILT dist) | Assert `statusLabel`/`deliveryModeLabel` present alongside English keys |
| 8 | D, E (mechanical) | Full `pnpm build` + `pnpm test` + `pnpm test:e2e` across the workspace | Any failure here is an import path, not logic |
| 9 | Hexagonal boundaries intact | `backend-boundaries` lint `--max-warnings 0` | Same gate as `backend-users-roles` |
| 10 | Nothing Spanish left | `rg -i 'creado\|verificado\|entregado\|cancelado\|recogida\|domicilio\|EFECTIVO\|TRANSFERENCIA\|convertir\|resolverTasa\|origen\|monedaDestino\|Ventas' templates --glob '!**/dist/**' --glob '!**/salesops-mvp/**'` | Expected residue: Spanish UI label VALUES (block H), `'Ventas Demo'` display name, applied migration comments, Spanish planning prose |
| 11 | No missed `switch` on the renamed enums | `rg 'switch\s*\(\s*\w*(status\|deliveryMode\|channel)' templates` | Exploration found only `if`/literal-equality guards; sweep confirms |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **`delivery` / `delivered` adjacency** — `deliveryMode: 'delivery'` sits next to `status: 'delivered'` on the same object; they are independent axes (a `pickup` order still reaches `delivered`) | High (confusion), Low (bugs) | Owner-locked decision, **not re-opened**. Mitigation is the mandatory explanatory comment on the `DeliveryMode` type def (block B). Do NOT rename to `home_delivery`. |
| **Seed slug data migration missed** → next seed run duplicates the demo category and orphans its products | Med | `UPDATE "category" SET slug = …` ships **inside the same W1 migration**; verification step 5 asserts exactly one row |
| **W5 follow-up collision** (`docs/plans/ventas-follow-ups-pendientes.md`, 100%-credit sales, edits `order.ts:133-141`) | Med | W5 MUST NOT land concurrently. Land this rename first on `salesops-rename-ventas`, then rebase W5 |
| **This IS a breaking wire-format change** for `POST/PATCH/GET /orders*` — enum values serialize as plain strings | Low today, real tomorrow | No in-repo consumer exists (`salesops-mvp` doesn't call the API; `static-store`/`storefront`/`web-common` have zero references), so today's blast radius is test code + seed. But any external client, Postman collection, or `salesops-mvp` once wired **will** break. Treat as a versionable contract change, not a free refactor |
| **Prisma auto-diff destroys the enums** if the hand-written migration is skipped or `schema.prisma` drifts | Med | `--create-only` no-op gate (verification step 3) before `prisma generate`. Never let `migrate dev` author this migration |
| **Editing an already-applied migration** to "fix" its Spanish comments breaks the `_prisma_migrations` checksum → drift error on `migrate deploy` | Med | Applied migrations are immutable history. Leave `20260722210122_add_ventas_module` and `20260723010000_order_drop_active_never_deletable` untouched, comments included |
| **W1 is unavoidably the largest commit** (3 enums × 3 layers of type defs + schema + migration) | Med | Forced by the compile coupling. Mitigated by pulling block G out into W4 and blocks D/E into W6 |
| **Test-literal churn dominates the diff** (`rate-resolver.test.ts` 37, `e2e` 29, `prisma-order.repository.spec.ts` 25, `order.test.ts` 22) | High volume, Low risk | Mechanical. Under strict TDD the RED phase is a literal swap, not a new assertion — do not manufacture fake behavioral tests to satisfy ceremony |
| **`salesops-mvp` looks like it should be renamed too** and someone folds it in | Med | Explicit OUT OF SCOPE section; it has its own richer `OrderState` and is not wired to the backend |

## Effort

| Layer / block | Files | Approx. changed lines |
|---|---|---|
| W1 — domain enums (A, B) + tests | 7 | 70–90 |
| W1 — `payment-channel.ts` + domain currency tests (C, domain side) | 3 | 50–70 |
| W1 — `schema.prisma` + new migration | 2 | 20–30 |
| W2 — infra-db repository + seed + specs (incl. F) | 4–5 | 60–80 |
| W2 — infra-db currency specs (C) | 1–2 | 10–15 |
| W3 — api-salesops src + unit specs | 5 | 40–50 |
| W3 — `test/ventas.e2e-spec.ts` | 1 | 30–40 |
| W3 — api-salesops currency controller/service specs (C) | 2 | 10–15 |
| W4 — Currency function/param renames (G) + call sites | 4–6 | 50–70 |
| W5 — Spanish labels (H, additive, incl. tests) | 4–5 | 50–70 |
| W6 — folder + class rename (D, E) | ~12 | 40–60 |
| W7 — `openspec/specs/salesops-ventas/spec.md` + docs literals | 3 | 60–80 |
| **Total** | **~45 files** | **~490–670 lines** |

Block C + G (the now-in-scope Currency work) accounts for roughly **97 occurrences across 17
files**, ~120–170 of those lines — spanning `packages/domain/src/currency/`,
`packages/infra-db/src/currency/`, `apps/api-salesops/src/currency/`, and
`migrations/20260720154712_add_currency_module/migration.sql` (read-only reference, not edited).

There is no PR review budget to respect here — the slicing above exists to keep each commit
independently green and independently revertible, not to fit a diff quota.

## Rollback

Self-contained on `salesops-rename-ventas`. Each work unit is an independent revert. Reverting
W1 requires an inverse migration (`ALTER TYPE … RENAME VALUE` back, plus the inverse `UPDATE
"category" SET slug`) — trivial to write and, per the existing
`order_drop_active_never_deletable` migration's own note, this is a pre-release owner-locked
branch with **no production data**, so a full drop-and-reseed is also survivable.

## Success criteria

- [ ] Owner confirms branch `salesops-rename-ventas` from `salesops-users` @ `163cd7d`.
- [ ] All blocks A–H implemented exactly as locked in #1529 — no re-derivation.
- [ ] Hand-written `ALTER TYPE … RENAME VALUE` migration applied; `enum_range` in Postgres shows
      only English labels; `migrate dev --create-only` diff is a no-op.
- [ ] `UPDATE "category" SET slug` shipped in the same migration; exactly one `sales-seed-demo`
      category after reseed, zero `ventas-seed-demo`.
- [ ] `DeliveryMode` carries the independence comment (`deliveryMode` ⟂ `status`).
- [ ] Domain vitest, infra-db jest (real Postgres), api-salesops unit + e2e all green **at every
      commit**, with `pnpm build` of domain+infra-db preceding e2e.
- [ ] `OrderResponseDto` exposes `statusLabel`/`deliveryModeLabel` alongside the English keys,
      mirroring `UserResponseDto.roleLabels`.
- [ ] Residue sweep (verification step 10) shows only intended Spanish: UI label values,
      `'Ventas Demo'`, applied-migration comments, planning prose.
- [ ] `apps/salesops-mvp` untouched.
- [ ] `backend-boundaries` lint green with `--max-warnings 0`.
- [ ] Single branch, work-unit commits, pushed at end, **no pull request**.

## Next step

`sdd-spec` and `sdd-design` may run in parallel from this proposal.
