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

**Progress (2026-07-25)**: WU1 DONE (`b435452`). WU2 DONE (`df3fc7c`) — atomic enum-value rename;
per orchestrator direction this run, WU2's commit also absorbed WU3's literal-guard/seed-literal work
(minus the seed namespace/slug/image renames, still open) and ALL of WU4. WU4 is DONE (no separate
commit — see its section). WU3 DONE (`9ec2caa`) — seed namespace/slug/image/doc-rot remainder, incl.
the required salt-stability comment and dev-DB idempotency proof (see apply-progress). WU5 DONE
(`6d722f2`) — Currency fn/param rename, also renamed the previously-unitemized `tryResolverTasa`
helper to `tryResolveRate` (see WU5 section for why).
Remaining open work: WU6, WU7.

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

**Status: [x] DONE** — commit `df3fc7c` (`feat(sales)!: rename OrderStatus/DeliveryMode/PaymentChannel
values to English`). 26 files changed, 303 insertions / 267 deletions. All 8 verification commands green
(domain 230/230, infra-db 121/121 real-Postgres, api-salesops unit 180/180, api-salesops e2e 50/50,
`pnpm -r build` clean, `prisma migrate dev --create-only` confirmed NO-OP against the hand-written SQL,
migration applied cleanly to both dev `store_mgmt` and test `store_mgmt_test`, full residue sweep zero
hits outside old `*/migrations/*` files and the explicitly out-of-scope `apps/salesops-mvp` prototype).
See `sdd/ventas-english-rename/apply-progress` for full detail.

**Scope note (deviation from original per-WU split, orchestrator-directed for this run)**: to keep the
whole workspace compiling and green in ONE atomic commit, this unit absorbed literal call-site updates
that the original plan below had assigned to WU3 (infra-db repository guards + seed.ts literals, MINUS
the `VENTAS_SEED_NAMESPACE`/slug/image-path renames — those remain WU3) and ALL of WU4 (api-salesops
service guard, DTO comment, unit specs, e2e), plus Currency's infra-db/api-salesops specs
(`prisma-currency.repository.spec.ts`, `currency.controller.spec.ts`, `currency.service.spec.ts`) which
were not itemized in any WU below but contain `PaymentChannel` literals that would otherwise break the
type. WU3 and WU4 sections below are updated accordingly — do not re-do this work.

**Do not split.** `infra-db` cannot compile with only part of this done.

**Size**: ~165–200 lines, ~9 files (original estimate — actual delivered commit is larger, see Status
note above for why).

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

## WU3 — infra-db seed source constant/slug/image renames (block F remainder)

**Status: [x] DONE** — commit `9ec2caa`. The literal enum-value guards in `prisma-order.repository.ts`
+ `prisma-order.repository.spec.ts`, and the enum-value literals inside `seed.ts` (deliveryMode/status
fixtures, `DEMO_MN_RATE_CHANNEL`) + `seed.spec.ts`, were already DONE in WU2 (commit `df3fc7c`). This
commit closed the remaining scope: `VENTAS_SEED_NAMESPACE`→`SALES_SEED_NAMESPACE`, `DEMO_CATEGORY_SLUG`
value `'ventas-seed-demo'`→`'sales-seed-demo'` (the fix that closes the duplicate-category window left
open since WU2's migration), both seed image paths, the required salt-stability comment at `seed.ts:18`,
`seed.spec.ts`'s cleanup-filter slug, and the `customer/seed.ts:27` doc-rot fix. Full detail, evidence,
and dev-DB idempotency proof in `sdd/ventas-english-rename/apply-progress`.

**Size**: small, 2 files (`seed.ts`, `packages/infra-db/src/customer/seed.ts` doc-rot fix).

**Commit**: `refactor(infra-db): rename seed namespace constant and demo asset paths to English`

**Files**:
- `packages/infra-db/src/sales/seed.ts`:
  - `VENTAS_SEED_NAMESPACE` → `SALES_SEED_NAMESPACE` (variable name ONLY — UUID value unchanged)
  - `DEMO_CATEGORY_SLUG` value `'ventas-seed-demo'` → `'sales-seed-demo'` (must now match what the WU2
    migration already renamed in the DB — until this lands, a manual seed run would upsert-miss and
    duplicate the category; see `sdd/ventas-english-rename/seed-salt-correction` #1537)
  - `image: 'ventas-seed/demo-usd.png'` / `'ventas-seed/demo-mn.png'` → `sales-seed/…` (cosmetic,
    product upsert's update clause overwrites on next seed run — no migration statement needed)
  - Add the required comment at `seed.ts:18` on the `` `ventas-seed:${key}` `` hash-salt string stating
    it must NEVER change (stability is its only load-bearing property — renaming it re-derives every
    seeded UUID and duplicates the demo dataset). **DO NOT rename the salt string itself.**
- `packages/infra-db/src/customer/seed.ts:27` — fix doc-rot: comment references `` `ventas/seed.ts`'s
  `VENTAS_SEED_NAMESPACE` `` , a path that no longer exists after WU1's folder rename → `sales/seed.ts`
  / `SALES_SEED_NAMESPACE`.

**Steps**:
1. Rename `VENTAS_SEED_NAMESPACE` → `SALES_SEED_NAMESPACE` (all references in `seed.ts`).
2. Rename `DEMO_CATEGORY_SLUG`'s value to `'sales-seed-demo'`; update `seed.spec.ts`'s cleanup filter
   (`slug: 'ventas-seed-demo'`) to match.
3. Rename the two image paths.
4. Add the salt-stability comment at line 18; do not touch the salt string.
5. Fix the doc-rot comment in `customer/seed.ts`.

**Verification**:
- `pnpm --filter @store-mgmt/infra-db test` (jest vs real Postgres)
- `psql $DATABASE_URL -c "SELECT slug, count(*) FROM category GROUP BY slug"` after running the seed
  script once → still exactly one `sales-seed-demo` row (idempotency)

---

## WU4 — api-salesops wiring (service guard, DTO comment, unit specs, e2e)

**Status: [x] DONE — absorbed into WU2** — `order.service.ts` guard, `create-order.dto.ts` doc comment,
`order.controller.spec.ts`, `order.service.spec.ts`, `order.e2e-spec.ts` were all updated as part of the
WU2 atomic commit `df3fc7c` (api-salesops cannot compile/pass tests against the renamed domain types
otherwise). No separate commit needed for this unit.

---

## WU5 — Currency function/param renames (block G)

**Status: [x] DONE** — commit `6d722f2` (`refactor(currency): rename convertir/resolverTasa functions to
English`). 12 files changed, 111 insertions / 111 deletions. All exported renames delivered
(`resolverTasa`→`resolveRate`, `convertir`→`convert`, `convertirEntreMonedas`→`convertBetweenCurrencies`),
plus params `origen`→`source`, `monedaDestino`→`targetCurrency`, local `destinoMinorUnits`→
`targetMinorUnits`. **Scope addition beyond this section's original file list**: the private helper
`tryResolverTasa` (line ~87, not itemized above) was also renamed to `tryResolveRate` — it directly named
the renamed `resolverTasa` in its own identifier and doc comment, so leaving it would have both
reintroduced Spanish residue and failed the mandatory zero-hit sweep (`resolverTasa` is a substring of
`tryResolverTasa`). Updated every call site (`order.ts`, `order-payment.ts`, `order-line.ts` in domain;
`currency.service.ts` in api-salesops) and every stale doc comment naming the old symbols (`pricing.ts`,
`schema.prisma`, `rate-response.dto.ts`, `order-payment.test.ts`/`order-line.test.ts` test-description
strings, and the full `rate-resolver.test.ts` — 20 tests). Verification ALL green: `pnpm -r build` exit 0,
domain 230/230, infra-db 121/121 (real Postgres), api-salesops unit 180/180, api-salesops e2e 50/50
(rebuilt dist first), residue sweep zero hits. See `sdd/ventas-english-rename/apply-progress` for full
detail.

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
