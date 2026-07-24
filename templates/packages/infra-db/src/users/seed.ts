import bcrypt from 'bcrypt';
import type { PrismaService } from '../prisma-client.js';
import { seedWarehouses } from '../inventory/seed.js';

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
} as const;

/**
 * Deterministic, collision-free login derivation shared by the migration's
 * SQL backfill (design.md §3/ADR-5) and this seed: normalized full name +
 * a short hex fragment of the row's own id. Kept in JS/SQL lockstep so a
 * customer backfilled by the migration and one backfilled by
 * `seedCustomers` never diverge in shape.
 */
export function deriveLogin(fullName: string, id: string): string {
  const normalized = fullName.replace(/[^a-zA-Z0-9]+/g, '.').toLowerCase();
  const idFragment = id.replace(/-/g, '').slice(0, 6);
  return `${normalized}.${idFragment}`;
}

export interface SeedUsersResult {
  readonly usersUpserted: number;
}

interface CockpitAccount {
  readonly login: string;
  readonly fullName: string;
  readonly roles: number;
}

/** The 4 cockpit accounts (design.md §3 seed plan) — data, not an enum. */
const COCKPIT_ACCOUNTS: readonly CockpitAccount[] = [
  { login: 'admin', fullName: 'Administrador', roles: USER_ROLES.admin },
  { login: 'owner', fullName: 'Dueño', roles: USER_ROLES.owner },
  { login: 'warehouse.operator', fullName: 'Operador de Almacén', roles: USER_ROLES.warehouse_operator },
  { login: 'sales.operator', fullName: 'Operador de Gestores', roles: USER_ROLES.sales_operator },
];

/** Logins of the 4 cockpit accounts — exported for test assertions. */
export const COCKPIT_LOGINS: readonly string[] = COCKPIT_ACCOUNTS.map((account) => account.login);

/**
 * Idempotent seed of the 4 cockpit accounts, keyed on `login` (upsert).
 * Passwords are the known DEV default, bcrypt-hashed at seed time — never a
 * plaintext column. The `warehouse.operator` account additionally gets a
 * `WarehouseOperator` row scoped to the first seeded warehouse (by name,
 * asc). Re-running never duplicates rows.
 */
export async function seedUsers(prisma: PrismaService): Promise<SeedUsersResult> {
  await seedWarehouses(prisma);
  const warehouse = await prisma.warehouse.findFirstOrThrow({ orderBy: { name: 'asc' } });
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS);

  for (const account of COCKPIT_ACCOUNTS) {
    await prisma.user.upsert({
      where: { login: account.login },
      update: {},
      create: {
        login: account.login,
        passwordHash,
        fullName: account.fullName,
        roles: account.roles,
      },
    });
  }

  const warehouseOperatorUser = await prisma.user.findUniqueOrThrow({
    where: { login: 'warehouse.operator' },
  });
  await prisma.warehouseOperator.upsert({
    where: { userId: warehouseOperatorUser.id },
    update: { warehouseId: warehouse.id },
    create: { userId: warehouseOperatorUser.id, warehouseId: warehouse.id },
  });

  return { usersUpserted: COCKPIT_ACCOUNTS.length };
}
