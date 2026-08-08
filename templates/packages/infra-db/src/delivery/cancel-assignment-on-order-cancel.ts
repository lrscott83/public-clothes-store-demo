import { Prisma } from '../../generated/tenant/client.js';

/**
 * The cancellation counterpart of `closeAssignmentOnDeliveryTx` — same
 * direction (B, Sales -> Delivery, design.md §2B), same mechanism (a guarded
 * conditional `UPDATE` invoked INSIDE `PrismaOrderRepository.cancel`'s
 * already-open `$transaction`), same "0 rows affected is a normal outcome"
 * contract.
 *
 * WHY IT EXISTS: `deliver` had a closer, `cancel` did not. An assigned order
 * that got cancelled therefore left a permanently `in_transit` row — the
 * carrier read BUSY forever in `computeCarrierCapacity`, and NO API path
 * could close it (`markDelivered` on a cancelled order throws
 * `InvalidOrderStateError`). The only recovery was manual SQL.
 *
 * WHY `cancelled` AND NOT `delivered`: closing the row as `delivered` would
 * make `computeCarrierThroughput` count a delivery that never happened —
 * corrupting throughput reporting to save a schema change. Explicitly
 * rejected.
 *
 * `delivered_at` is deliberately left untouched (it stays NULL): a
 * cancellation is not a delivery, and stamping it would make the two
 * indistinguishable to anything reading that column.
 *
 * Closes AT MOST ONE row — the `in_transit` assignment for `orderId`, if
 * any. 0 rows is the NORMAL case for a pickup order (never has a row), an
 * unassigned delivery order, or a re-application. Never `findUniqueOrThrow`.
 *
 * WHY `${...}::text::"DeliveryAssignmentStatus"` AND NOT A LITERAL CAST:
 * `cancelled` is a NEW enum value, and tenant schemas only gain it through a
 * manual, out-of-band `node scripts/tenant-migrate.ts`. Postgres resolves a
 * LITERAL cast (`'cancelled'::"DeliveryAssignmentStatus"`) at PLAN time, so
 * on a tenant that has not been migrated yet it raised `invalid input value
 * for enum` regardless of whether any row matched the `WHERE` — which made
 * `POST /orders/:id/cancel` a 500 that rolled back for EVERY order in that
 * tenant: pickup, unassigned, `created`, all of them. A pre-existing Sales
 * endpoint should not break because a DELIVERY table gained a value.
 *
 * A bind parameter cast through `text` goes through `enum_in`, which is
 * STABLE (enum labels can change), so the planner does not constant-fold it
 * and the coercion happens per updated ROW. With no matching row it is never
 * evaluated — verified empirically against Postgres 16 in this module's own
 * spec, which builds a genuine pre-migration schema by hand (the regular
 * suites cannot see the difference: `useTenantSchema()` always provisions
 * from the freshly regenerated `tenant-schema.sql`).
 *
 * A tenant that IS behind AND genuinely holds an open assignment for the
 * cancelled order still fails, loudly — there is no honest way to close that
 * row without the enum value. That single case is the residual, and the
 * schema-currency probe is what surfaces it BEFORE the failing request rather
 * than as a runtime surprise: it asserts precisely that every tenant's
 * `DeliveryAssignmentStatus` carries every label this build writes, which is
 * this exact `cancelled` value.
 *
 * WHERE that surfaces changed, and the distinction matters here.
 * `reportTenantSchemaCurrency` LOGS at boot and can never refuse it — it used
 * to `process.exit(1)`, which turned one tenant's missing label into a
 * company-wide outage. The refusal now lives in `TenantContextGuard`, per
 * request, scoped to the tenant that is actually behind: at
 * `TENANT_SCHEMA_DRIFT_CHECK=enforce` that tenant gets 503 and every other
 * tenant keeps serving; the default `warn` logs once and serves. Either way
 * it covers only ENUM LABELS — `node scripts/tenant-migrate.ts --check` in CI
 * is the deploy-time check, and it covers the whole DDL.
 */
export async function cancelAssignmentOnOrderCancelTx(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`UPDATE "delivery_assignment" SET "status" = ${'cancelled'}::text::"DeliveryAssignmentStatus", "updated_at" = now() WHERE "order_id" = ${orderId}::uuid AND "status" = ${'in_transit'}::text::"DeliveryAssignmentStatus"`,
  );
}
