import type { PrismaService } from './prisma-client.js';

/**
 * Shared teardown for the integration specs.
 *
 * Every spec here runs against ONE real `store_mgmt_test` database, and until
 * now each kept its own hand-written list of tables to clear. That worked while
 * the schema was small and failed three times in a row once it was not: each
 * migration that adds a `RESTRICT` edge silently invalidates every list that
 * does not mention the new table, and the failure lands in an unrelated spec,
 * on a constraint it never heard of, only when the runner happens to order the
 * suites a certain way. It reads as flakiness. It is a stale list.
 *
 * These helpers exist so that knowledge lives in ONE place. A migration that
 * adds an inbound `RESTRICT` edge should be reflected here and nowhere else.
 */

/**
 * The three commission tables, in reverse-FK order.
 *
 * `product_commission_reference` → `product` and `commission_accrual` → `order`
 * are both `RESTRICT`, so any spec that bulk-deletes products or orders must
 * call this first — including specs with nothing to do with commissions.
 *
 * The constraints are `RESTRICT` on purpose: a commission reference is
 * configuration and an accrual is money someone earned, and neither should
 * vanish because a row upstream was deleted. Cleaning up explicitly is the
 * price of that guarantee.
 */
export async function wipeCommissionTables(prisma: PrismaService): Promise<void> {
  await prisma.commissionPayment.deleteMany({});
  await prisma.commissionAccrual.deleteMany({});
  await prisma.productCommissionReference.deleteMany({});
}

/**
 * Everything that holds a `RESTRICT` reference to `company_user`, so that a
 * bulk `companyUser.deleteMany({})` can succeed.
 *
 * Migration A added `sales_order.attributed_company_user_id` and migration B
 * added `commission_accrual.attributed_company_user_id`, both `RESTRICT`. Ten
 * specs under `users/`, `company/` and `customer/` delete company users in bulk
 * and know about neither table.
 */
export async function wipeCompanyUserDependents(prisma: PrismaService): Promise<void> {
  await wipeCommissionTables(prisma);
  await prisma.orderPayment.deleteMany({});
  await prisma.saleCredit.deleteMany({});
  await prisma.orderLine.deleteMany({});
  await prisma.order.deleteMany({});
  // Migration C's self-FK: an assignment that created another assignment is
  // `RESTRICT` against its own table, so the created ones go first.
  await prisma.companyUser.deleteMany({ where: { createdByCompanyUserId: { not: null } } });
}
