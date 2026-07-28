import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { PrismaService } from '../prisma-client.js';
import { DEV_PASSWORD, SALT_ROUNDS, deriveLogin } from '../users/seed.js';
import { ensureDefaultCompanyId, seedCompanyUser } from '../company/seed.js';

/**
 * The 5 seeded demo customers, sourced from the MVP's
 * `apps/salesops-mvp/app/seed/constants.ts` `CLIENT_NAME_POOL` — Data, not
 * an enum (design.md seed plan). `documentId` is left `null` — no
 * fabricated government IDs.
 */
export const CUSTOMER_NAMES = [
  'Ana Torres',
  'Luis Pérez',
  'Marta Gómez',
  'José Díaz',
  'Yanet Cruz',
] as const;

export interface SeedCustomerResult {
  readonly customersUpserted: number;
}

/** The `user` bit — mirrors `packages/domain/src/users/roles.ts` `USER_ROLES.user`. */
const USER_ROLE_BIT = 1;

/**
 * Fixed, arbitrary namespace UUID for deriving a stable per-name id used
 * ONLY as `deriveLogin`'s id-fragment input (RFC 4122 UUID v5) — mirrors
 * `sales/seed.ts`'s `SALES_SEED_NAMESPACE` pattern, own namespace so the
 * two never collide. This id is NOT the real `Customer.id` (Prisma still
 * DB-generates that) — it exists purely so the demo customers' derived
 * `login` stays stable/idempotent across re-seeds, keyed on `fullName`
 * (which never repeats within `CUSTOMER_NAMES`).
 */
const CUSTOMER_SEED_NAMESPACE = '6b1f2a3c-4d5e-4f60-8a7b-9c0d1e2f3a4b';

function deterministicSeedId(fullName: string): string {
  const namespaceBytes = Buffer.from(CUSTOMER_SEED_NAMESPACE.replace(/-/g, ''), 'hex');
  const nameBytes = Buffer.from(`customer-seed:${fullName}`, 'utf8');
  const hash = createHash('sha1').update(Buffer.concat([namespaceBytes, nameBytes])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Idempotent seed of the 5 demo customers, keyed on `fullName` (the natural
 * key — `Customer.fullName` has no DB-level unique constraint per the
 * LOCKED model, so idempotency is enforced here via a
 * find-then-create-or-update, not a native Prisma `upsert`). Since
 * `backend-users-roles`, EVERY `Customer` requires a `User` — this finds or
 * creates a matching `app_user` (`login` = `deriveLogin(fullName, ...)`,
 * bcrypt-hashed dev password, `roles=user`) per demo customer, keyed on the
 * User's own `login` (upsert), then links `userId` and gives that User an
 * ACTIVE `CompanyUser` in the implicit company with the `user` bit —
 * without it the account has no persisted authorization once migration 002
 * drops `app_user.roles`, and every login is rejected. Idempotent on all
 * sides. Re-running never duplicates rows. All other contact fields stay
 * empty/null.
 */
export async function seedCustomers(prisma: PrismaService): Promise<SeedCustomerResult> {
  const companyId = await ensureDefaultCompanyId(prisma);
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS);

  for (const fullName of CUSTOMER_NAMES) {
    const login = deriveLogin(fullName, deterministicSeedId(fullName));
    const user = await prisma.user.upsert({
      where: { login },
      update: {},
      create: { login, passwordHash, fullName, roles: USER_ROLE_BIT },
    });
    await seedCompanyUser(prisma, user.id, companyId, USER_ROLE_BIT);

    const existing = await prisma.customer.findFirst({ where: { fullName } });
    if (existing) {
      await prisma.customer.update({
        where: { id: existing.id },
        data: { active: true, userId: user.id },
      });
    } else {
      await prisma.customer.create({ data: { fullName, active: true, userId: user.id } });
    }
  }

  return { customersUpserted: CUSTOMER_NAMES.length };
}
