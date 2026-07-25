# Tasks: ventas-english-rename

No spec/design artifacts (owner decision — pure rename, zero behavior change; naming is locked in
`sdd/ventas-english-rename/naming-decisions` #1529). Delivery model: **single branch
`salesops-rename-ventas`** cut from `salesops-users` @ `163cd7d`, work-unit commits, push at end,
**NO PULL REQUEST**. No 400-line PR budget applies — slicing is governed ONLY by
compile/test integrity: every commit must leave build + full test matrix green.
Conventional commits, no AI attribution.

All `pnpm` commands run from `templates/`. Package names: `@store-mgmt/domain`,
`@store-mgmt/infra-db`, `@store-mgmt/api-salesops`.

Sequencing note (overrides original proposal, owner-confirmed 2026-07-25): WU1 (folders D +
classes E) now runs FIRST, ahead of enum work, so every later unit operates on final paths
(`packages/domain/src/sales/`, `packages/infra-db/src/sales/`, `apps/api-salesops/src/sales/`).
Est. total: **~490–670 changed lines / ~45 files** (see per-unit sizing below, sourced from #1523
occurrence counts).

---

## WU1 — Structural rename: `ventas/` → `sales/` folders, `Ventas*` → `Order*`/`SalesModule` classes (blocks D+E)

**Status: [x] DONE** — commit `b435452` (`refactor(sales): rename ventas module to sales, Ventas* classes to
Order*/SalesModule`), preceded by planning-artifact commit `0f5bb30`. All 5 verification commands green
(domain 230/230, infra-db 121/121, api-salesops unit 180/180, api-salesops e2e 50/50, `pnpm -r build` clean)
plus the residue-sweep regex `Ventas(Controller|Service|Module)|from '.*\/ventas\/|ventasService|ventasController`
returned zero hits. See `sdd/ventas-english-rename/apply-progress` for full detail.

**Size**: ~30–50 lines, 29 files (pure `git mv` + import path/identifier edits, no content change).

**Commit**: `refactor(sales): rename ventas folder and classes to sales/order (D+E)`

**Files**:
- `git mv packages/domain/src/ventas packages/domain/src/sales` (11 files: `errors.ts`, `index.ts`, `order.ts`,
  `order.test.ts`, `order-line.ts`, `order-line.test.ts`, `order-payment.ts`, `order-payment.test.ts`,
  `order-repository.port.ts`, `sale-credit.ts`, `sale-credit.test.ts`)
- `packages/domain/src/index.ts:10` — import path `./ventas` → `./sales`
- `git mv packages/infra-db/src/ventas packages/infra-db/src/sales` (4 files: `seed.ts`, `seed.spec.ts`,
  `prisma-order.repository.ts`, `prisma-order.repository.spec.ts`)
- `packages/infra-db/src/index.ts:11` — import path `./ventas` → `./sales`
- `git mv apps/api-salesops/src/ventas apps/api-salesops/src/sales`, then inside it:
  `git mv ventas.controller.ts order.controller.ts`, `git mv ventas.service.ts order.service.ts`,
  `git mv ventas.module.ts sales.module.ts`, `git mv ventas.controller.spec.ts order.controller.spec.ts`,
  `git mv ventas.service.spec.ts order.service.spec.ts` (`dto/` subfolder moves as-is, no file renames)
- `git mv apps/api-salesops/test/ventas.e2e-spec.ts apps/api-salesops/test/order.e2e-spec.ts`
- `apps/api-salesops/src/app.module.ts:11` — import path + `VentasModule` → `SalesModule`

**Steps**:
1. `git mv` the three directories and the five renamed files (Prettier/ESLint noise minimized by using
   `git mv`, not delete+recreate).
2. Rename classes/identifiers inside moved files: `VentasController`→`OrderController`,
   `VentasService`→`OrderService`, `VentasModule`→`SalesModule`; constructor field
   `ventasService`→`orderService`; spec-file local vars `ventasController`/`ventasService`→
   `orderController`/`orderService`. Confirm `@Controller('orders')` decorator string is untouched.
3. Fix all relative imports inside the moved trees that reference sibling files by old names.
4. Update the three cross-package barrel/wiring imports listed above.
5. `rg -i ventas templates/packages/domain/src templates/packages/infra-db/src templates/apps/api-salesops/src templates/apps/api-salesops/test` → zero hits (residue check).

**Verification**:
- `pnpm --filter @store-mgmt/domain test`
- `pnpm --filter @store-mgmt/domain build && pnpm --filter @store-mgmt/infra-db build`
- `pnpm --filter @store-mgmt/infra-db test`
- `pnpm --filter @store-mgmt/api-salesops test`
- `pnpm --filter @store-mgmt/api-salesops build && pnpm --filter @store-mgmt/api-salesops test:e2e`

---

## WU2 — ATOMIC: enum value rename (blocks A+B+C) + `schema.prisma` + hand-written migration

**Do not split.** `infra-db` cannot compile with only part of this done.

**Size**: ~165–200 lines, ~9 files. Heaviest test file: `rate-resolver.test.ts` (37 hits, block C only —
function names stay `convertir`/etc. until WU5).

**Commit**: `feat(sales)!: rename OrderStatus/DeliveryMode/PaymentChannel enum values to English`
(footer: `BREAKING CHANGE: /orders* wire format enum values changed from Spanish to English —
creado→created, verificado→verified, entregado→delivered, cancelado→cancelled, recogida→pickup,
domicilio→delivery, USD_EFECTIVO→USD_CASH, EUR_EFECTIVO→EUR_CASH, MN_EFECTIVO→MN_CASH,
MN_TRANSFERENCIA→MN_TRANSFER.`)

**Files**:
- `packages/domain/src/currency/payment-channel.ts` (type + `CHANNEL_CURRENCY` map — block C)
- `packages/domain/src/currency/payment-channel.test.ts` (11 hits)
- `packages/domain/src/currency/rate-resolver.test.ts` (37 hits — literals only)
- `packages/domain/src/sales/order.ts` (type defs, 5 literal comparisons in
  `createOrder`/`confirmOrder`/`deliverOrder`/`cancelOrder`, doc comments; add the agreed comment on
  `DeliveryMode` stating `deliveryMode`/`status` are independent axes)
- `packages/domain/src/sales/order.test.ts` (22 hits)
- `packages/domain/src/sales/order-repository.port.ts` (doc comment)
- `packages/domain/src/sales/errors.ts` (doc comment)
- `packages/infra-db/prisma/schema.prisma` (`enum PaymentChannel` L16-22, `enum OrderStatus` L227-232,
  `enum DeliveryMode` L234-237, `status OrderStatus @default(creado)`→`@default(created)` L246,
  Spanish narrative comment L200-231 + `delivery_mode` inline comment L244)
- NEW `packages/infra-db/prisma/migrations/20260725170000_rename_sales_currency_enums_to_english/migration.sql`

**Steps**:
1. Update `payment-channel.ts` (block C), then its test + `rate-resolver.test.ts` literals.
2. Update `order.ts` type defs + 5 literal guards + doc comments + the DeliveryMode independent-axes comment.
3. Update `order.test.ts`, `order-repository.port.ts`, `errors.ts`.
4. `pnpm --filter @store-mgmt/domain test` → green.
5. Edit `schema.prisma` enum blocks + default value + narrative comments to match.
6. Hand-write the migration SQL (Prisma does not generate `RENAME VALUE`; its auto-diff is destructive
   DROP/CREATE):
   ```sql
   ALTER TYPE "OrderStatus" RENAME VALUE 'creado' TO 'created';
   ALTER TYPE "OrderStatus" RENAME VALUE 'verificado' TO 'verified';
   ALTER TYPE "OrderStatus" RENAME VALUE 'entregado' TO 'delivered';
   ALTER TYPE "OrderStatus" RENAME VALUE 'cancelado' TO 'cancelled';
   ALTER TYPE "DeliveryMode" RENAME VALUE 'recogida' TO 'pickup';
   ALTER TYPE "DeliveryMode" RENAME VALUE 'domicilio' TO 'delivery';
   ALTER TYPE "PaymentChannel" RENAME VALUE 'USD_EFECTIVO' TO 'USD_CASH';
   ALTER TYPE "PaymentChannel" RENAME VALUE 'EUR_EFECTIVO' TO 'EUR_CASH';
   ALTER TYPE "PaymentChannel" RENAME VALUE 'MN_EFECTIVO' TO 'MN_CASH';
   ALTER TYPE "PaymentChannel" RENAME VALUE 'MN_TRANSFERENCIA' TO 'MN_TRANSFER';
   UPDATE "category" SET slug = 'sales-seed-demo' WHERE slug = 'ventas-seed-demo';
   ```
7. `pnpm --filter @store-mgmt/infra-db exec prisma migrate dev --create-only` → MUST be a no-op diff
   against the hand-written SQL. If Prisma proposes a destructive diff, schema and migration disagree —
   reconcile before continuing.
8. `pnpm --filter @store-mgmt/infra-db exec prisma generate`.

**Verification**:
- `pnpm --filter @store-mgmt/domain test`
- `pnpm --filter @store-mgmt/infra-db exec prisma migrate dev --create-only` (confirm no-op)
- `psql $DATABASE_URL -c "SELECT unnest(enum_range(NULL::\"OrderStatus\"))"` (repeat for `DeliveryMode`,
  `PaymentChannel`) → English labels only
- `psql $DATABASE_URL -c "SELECT slug, count(*) FROM category GROUP BY slug"` → one `sales-seed-demo`,
  zero `ventas-seed-demo`

---

## WU3 — infra-db repository + seed (block F)

**Size**: ~60–80 lines, 4 files (first real proof of the migration against Postgres).

**Commit**: `refactor(infra-db): update sales repository and seed for English enum values`

**Files**:
- `packages/infra-db/src/sales/prisma-order.repository.ts` (11 literal guards, ~L342-414, + doc comment)
- `packages/infra-db/src/sales/prisma-order.repository.spec.ts` (25 hits — heaviest infra-db test file)
- `packages/infra-db/src/sales/seed.ts` (block F: `VENTAS_SEED_NAMESPACE`→`SALES_SEED_NAMESPACE`,
  `DEMO_CATEGORY_SLUG` `'ventas-seed-demo'`→`'sales-seed-demo'`, `deliveryMode`/status literals in the
  4 seeded orders; keep display name `'Ventas Demo'` in Spanish)
- `packages/infra-db/src/sales/seed.spec.ts` (6 hits)

**Steps**:
1. Update `prisma-order.repository.ts` literal guards + doc comment.
2. Update `seed.ts`: rename the namespace constant and the demo category slug value (must match the
   migration's `UPDATE` target from WU2), update literal order fixtures.
3. Update both spec files' literals to match.
4. Apply the WU2 migration to the test DB (`store_mgmt_test`) if not already applied.

**Verification**:
- `pnpm --filter @store-mgmt/infra-db test` (jest vs real Postgres — script sets
  `NODE_OPTIONS=--experimental-vm-modules`; do not run bare `npx jest`)
- `psql $DATABASE_URL -c "SELECT slug, count(*) FROM category GROUP BY slug"` after running the seed
  script once → still exactly one `sales-seed-demo` row (idempotency)

---

## WU4 — api-salesops wiring (service guard, DTO comment, unit specs, e2e)

**Size**: ~70–90 lines, 4 files (heaviest: `order.e2e-spec.ts`, 29 hits). **Requires `pnpm build` of
domain + infra-db first** — e2e runs against built `dist`, stale dist silently tests old code.

**Commit**: `refactor(api-salesops): update sales wiring for English enum values`

**Files**:
- `apps/api-salesops/src/sales/order.service.ts` (`existing.status !== 'creado'` guard, doc comments)
- `apps/api-salesops/src/sales/dto/create-order.dto.ts` (doc comment quoting `"recogida"|"domicilio"`)
- `apps/api-salesops/src/sales/order.controller.spec.ts` (18 hits), `order.service.spec.ts` (18 hits)
- `apps/api-salesops/test/order.e2e-spec.ts` (29 hits)

**Steps**:
1. `pnpm --filter @store-mgmt/domain build && pnpm --filter @store-mgmt/infra-db build`.
2. Update `order.service.ts` literal guard + comments; `create-order.dto.ts` doc comment.
3. Update both unit specs' literals.
4. Update `order.e2e-spec.ts` literals (requests + assertions).

**Verification**:
- `pnpm --filter @store-mgmt/api-salesops test`
- `pnpm --filter @store-mgmt/api-salesops test:e2e`

---

## WU5 — Currency function/param renames (block G)

**Size**: ~20–30 lines, 4 files. Pure TS, kept out of WU2 to keep the atomic commit focused.

**Commit**: `refactor(currency): rename convertir/convertirEntreMonedas/resolverTasa to English`

**Files**:
- `packages/domain/src/currency/rate-resolver.ts` (`convertir`→`convert` L148-185,
  `convertirEntreMonedas`→`convertBetweenCurrencies` L197-222, `resolverTasa`→`resolveRate` L69-80,
  params `origen`→`source`, `monedaDestino`→`targetCurrency`, local `destinoMinorUnits`→`targetMinorUnits`)
- `packages/domain/src/sales/order.ts:5` (import `convertirEntreMonedas`→`convertBetweenCurrencies`)
- `packages/domain/src/sales/order-payment.ts:6` (import `convertir`→`convert`)
- `packages/domain/src/currency/currency.service.ts:59` (local `origen`→`source`)

**Steps**:
1. Rename exported functions + params in `rate-resolver.ts`.
2. Update the two call sites in `order.ts`/`order-payment.ts`.
3. Rename the local var in `currency.service.ts`.
4. Update any remaining references in `rate-resolver.test.ts` to the new function names (values were
   already renamed in WU2; this pass renames the function-call identifiers only).

**Verification**:
- `pnpm --filter @store-mgmt/domain test`
- `pnpm --filter @store-mgmt/infra-db build && pnpm --filter @store-mgmt/api-salesops build`
- `pnpm --filter @store-mgmt/api-salesops test`

---

## WU6 — Spanish labels (block H, additive — strict TDD RED→GREEN)

**Size**: ~40–60 lines, 4 files. No rename risk — purely additive.

**Commit**: `feat(sales): add Spanish display labels for order status/delivery/payment channel`

**Files**:
- NEW `packages/domain/src/sales/labels.ts` (`ORDER_STATUS_LABELS_ES`, `DELIVERY_MODE_LABELS_ES` +
  helpers, mirroring `packages/domain/src/users/roles.ts` `ROLE_LABELS_ES`/`RoleHelpers`)
- `packages/domain/src/currency/payment-channel.ts` (`PAYMENT_CHANNEL_LABELS_ES` beside
  `CHANNEL_CURRENCY`)
- `apps/api-salesops/src/sales/dto/order-response.dto.ts` (new `statusLabel`, `deliveryModeLabel` fields)
- `apps/api-salesops/src/sales/order.service.ts` (compute the two label fields in the response mapper)

**Values** (neutral LatAm Spanish): created=Creado, verified=Verificado, delivered=Entregado,
cancelled=Cancelado, pickup=«Recogida en tienda», delivery=«Envío a domicilio», ZELLE=Zelle,
USD_CASH=«USD en efectivo», EUR_CASH=«EUR en efectivo», MN_CASH=«MN en efectivo»,
MN_TRANSFER=«Transferencia en MN».

**Steps**:
1. RED: add `labels.test.ts` (or extend `order.test.ts`) asserting `ORDER_STATUS_LABELS_ES`/
   `DELIVERY_MODE_LABELS_ES` cover every enum member with the values above — fails (module doesn't exist).
2. GREEN: create `labels.ts`; add `PAYMENT_CHANNEL_LABELS_ES` to `payment-channel.ts`.
3. Wire `statusLabel`/`deliveryModeLabel` into `OrderResponseDto` and the service mapper; extend
   `order.service.spec.ts`/`order.e2e-spec.ts` to assert the new fields.

**Verification**:
- `pnpm --filter @store-mgmt/domain test`
- `pnpm --filter @store-mgmt/domain build && pnpm --filter @store-mgmt/infra-db build`
- `pnpm --filter @store-mgmt/api-salesops test && pnpm --filter @store-mgmt/api-salesops test:e2e`

---

## WU7 — OpenSpec spec + docs literal sweep

**Size**: ~60–70 lines, 3 files. Final unit — spec should describe shipped behavior, not precede it.

**Commit**: `docs(sales): update spec and plan docs for English enum literals`

**Files**:
- `openspec/specs/salesops-ventas/spec.md` (66 quoted enum-literal occurrences — accuracy fix only,
  requirement prose stays as-is)
- `docs/plans/ventas-follow-ups-pendientes.md` (quoted literals only)
- `docs/plans/ventas-devoluciones-flujo-diferido.md` (quoted literals only)

**Steps**:
1. `rg -n "creado|verificado|entregado|cancelado|recogida|domicilio|EFECTIVO|TRANSFERENCIA" openspec/specs/salesops-ventas/spec.md docs/plans/ventas-*.md`
2. Replace each quoted literal with its English value. Do not translate surrounding Spanish prose.

**Verification**:
- Full residue sweep: `rg -i "ventas|creado|verificado|entregado|cancelado|recogida|domicilio|EFECTIVO|TRANSFERENCIA" templates openspec/specs/salesops-ventas` — expected remaining hits ONLY: UI label VALUES (block H), `'Ventas Demo'` display name, applied-migration file comments (historical, do not edit), Spanish planning prose.
- `pnpm -w build && pnpm -w test` (full workspace) from `templates/`
- `pnpm --filter @store-mgmt/api-salesops` lint: `backend-boundaries` rule, `--max-warnings 0`
- `rg -n "switch\s*\(\s*\w*(status|deliveryMode|channel)"` across `packages/domain/src`,
  `packages/infra-db/src`, `apps/api-salesops/src` → confirm still zero (no exhaustiveness-check
  switch statements were missed)

---

## Requirement Traceability

| Naming block (#1529) | Work unit |
|---|---|
| A — OrderStatus | WU2 |
| B — DeliveryMode | WU2 |
| C — PaymentChannel | WU2 |
| D — Folders | WU1 |
| E — Classes/files | WU1 |
| F — Seed | WU2 (migration UPDATE) + WU3 (source constant) |
| G — Currency fn/param | WU5 |
| H — Spanish labels | WU6 |
| Spec/docs sweep | WU7 |

## Dependency / Parallelism

Strictly sequential — WU1 → WU2 → WU3 → WU4 → WU5 → WU6 → WU7. Each unit depends on the previous
unit's final file paths and/or compiled output (domain/infra-db must build before api-salesops e2e).
No parallel work units; this is a single branch, single contributor, no PR review, so sequencing is
driven purely by compile order, not reviewer parallelism.

## Delivery Notes (no PR review budget applies)

- Single branch `salesops-rename-ventas` from `salesops-users` @ `163cd7d`.
- Conventional commits, no AI attribution, no `Co-Authored-By`.
- Push once at the end, after all 7 work units are green — no PR is opened.
- Every commit boundary above is independently revertible (WU2's revert needs an inverse
  `ALTER TYPE ... RENAME VALUE` + inverse category `UPDATE`).
