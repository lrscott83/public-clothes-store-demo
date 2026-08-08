import bcrypt from 'bcrypt';
import type { IMembershipRepository } from '@store-mgmt/domain';
import type { PrismaMasterService } from '../master-prisma-client.js';
import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant/client.js';
import { seedWarehouses } from '../inventory/seed.js';
import { grantTenantRole } from '../company/grant-tenant-role.js';

/**
 * DEV-only known password for every seeded account (cockpit accounts here
 * AND demo customers in `customer/seed.ts`, which reuses this constant) —
 * never a fabricated real credential.
 */
export const DEV_PASSWORD = 'DevPass123!';
export const SALT_ROUNDS = 10;

/** Bitmask role values — mirrors `packages/domain/src/users/roles.ts` `USER_ROLES` (kept in sync, no cross-package import to avoid a build-order dependency for this literal). */
const USER_ROLES = {
  user: 1,
  warehouse_operator: 2,
  sales_operator: 4,
  owner: 8,
  admin: 16,
  sales_agent: 32,
} as const;

/**
 * Deterministic, collision-free login derivation shared by the migration's
 * SQL backfill (design.md §3/ADR-5) and `customer/seed.ts`'s demo-customer
 * seed: normalized full name + a short hex fragment of the row's own id.
 */
export function deriveLogin(fullName: string, id: string): string {
  const normalized = fullName.replace(/[^a-zA-Z0-9]+/g, '.').toLowerCase();
  const idFragment = id.replace(/-/g, '').slice(0, 6);
  return `${normalized}.${idFragment}`;
}

interface CockpitAccount {
  readonly login: string;
  readonly fullName: string;
  readonly roles: number;
}

/** The cockpit accounts (design.md §3 seed plan) — data, not an enum. */
const COCKPIT_ACCOUNTS: readonly CockpitAccount[] = [
  { login: 'admin', fullName: 'Administrador', roles: USER_ROLES.admin },
  { login: 'owner', fullName: 'Dueño', roles: USER_ROLES.owner },
  { login: 'warehouse.operator', fullName: 'Operador de Almacén', roles: USER_ROLES.warehouse_operator },
  { login: 'sales.operator', fullName: 'Operador de Gestores', roles: USER_ROLES.sales_operator },
  { login: 'sales.agent', fullName: 'Gestor de Ventas', roles: USER_ROLES.sales_agent },
];

/**
 * The cockpit `sales_agent`. Demo orders are attributed to THIS account's
 * assignment, so the seeded data exercises the same attribution path a real
 * sale takes instead of leaving the column null everywhere.
 */
export const SALES_AGENT_LOGIN = 'sales.agent';

/** Logins of the cockpit accounts — exported for test assertions. */
export const COCKPIT_LOGINS: readonly string[] = COCKPIT_ACCOUNTS.map((account) => account.login);

/** `login -> master User.id`, for every cockpit account. */
export type CockpitUserIds = Readonly<Record<string, string>>;

export interface SeedCockpitUsersResult {
  readonly usersUpserted: number;
  readonly userIds: CockpitUserIds;
  /** `userIds['owner']`, surfaced directly since `provisionCompany` needs it as `ownerId`. */
  readonly ownerId: string;
}

/**
 * Idempotent seed of the cockpit accounts' master `User` rows ONLY, keyed
 * on `login` (upsert) — no tenant grant, no `Company` at all (task 14.2
 * split: a tenant does not exist until `provisionCompany` runs, and
 * provisioning itself needs an EXISTING `ownerId`, so master User creation
 * has to come first). Re-running never duplicates rows.
 */
export async function seedCockpitUsers(masterPrisma: PrismaMasterService): Promise<SeedCockpitUsersResult> {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS);
  const userIds: Record<string, string> = {};

  for (const account of COCKPIT_ACCOUNTS) {
    const user = await masterPrisma.user.upsert({
      where: { login: account.login },
      update: {},
      create: { login: account.login, passwordHash, fullName: account.fullName },
    });
    userIds[account.login] = user.id;
  }

  return { usersUpserted: COCKPIT_ACCOUNTS.length, userIds, ownerId: userIds['owner']! };
}

export interface SeedUsersResult {
  readonly usersUpserted: number;
}

/**
 * Grants every cockpit account its role INSIDE the already-provisioned
 * tenant — an ACTIVE master `Membership` + a tenant `CompanyUser`
 * (`grantTenantRole`, task 14.2). Re-granting the `owner` account is safe
 * and idempotent: `provisionCompany` already wrote its Membership+
 * CompanyUser as part of D7 step 4/5, `grantTenantRole` just reuses both.
 * Also seeds the 3 warehouses and links `warehouse.operator`'s tenant
 * `CompanyUser` to the first one (by name, asc) via `WarehouseOperator`.
 */
export async function grantCockpitRoles(
  membershipRepository: IMembershipRepository,
  tenantClient: TenantPrismaClient,
  companyId: string,
  users: SeedCockpitUsersResult,
): Promise<SeedUsersResult> {
  await seedWarehouses(tenantClient);
  const warehouse = await tenantClient.warehouse.findFirstOrThrow({ orderBy: { name: 'asc' } });

  for (const account of COCKPIT_ACCOUNTS) {
    const userId = users.userIds[account.login]!;
    await grantTenantRole(membershipRepository, tenantClient, {
      userId,
      companyId,
      role: account.roles,
      createdByCompanyUserId: null,
    });
  }

  const warehouseOperatorId = users.userIds['warehouse.operator']!;
  await tenantClient.warehouseOperator.upsert({
    where: { companyUserId: warehouseOperatorId },
    update: { warehouseId: warehouse.id },
    create: { companyUserId: warehouseOperatorId, warehouseId: warehouse.id },
  });

  return { usersUpserted: COCKPIT_ACCOUNTS.length };
}
