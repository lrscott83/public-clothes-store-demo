import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { IMembershipRepository } from '@store-mgmt/domain';
import type { PrismaMasterService } from '../master-prisma-client.js';
import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant/client.js';
import { DEV_PASSWORD, SALT_ROUNDS, deriveLogin } from '../users/seed.js';
import { grantTenantRole } from '../company/grant-tenant-role.js';

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
 * find-then-create-or-update, not a native Prisma `upsert`).
 *
 * task 14.2 reshape: `User` creation stays MASTER-side
 * (`masterPrisma.user.upsert`); the role grant is now `grantTenantRole`
 * (ACTIVE master `Membership` + tenant `CompanyUser`, design D1/D4 — this
 * replaces the pre-split single `company_user` row the `user` bit used to
 * carry alone); the `Customer` row itself is TENANT-side and now links via
 * `companyUserId`, not `userId` (spec: salesops-customers "Customer FKs
 * Tenant CompanyUser, Not Master User"). Idempotent on all three sides.
 * Re-running never duplicates rows. All other contact fields stay
 * empty/null.
 */
export async function seedCustomers(
  masterPrisma: PrismaMasterService,
  membershipRepository: IMembershipRepository,
  tenantClient: TenantPrismaClient,
  companyId: string,
): Promise<SeedCustomerResult> {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS);

  for (const fullName of CUSTOMER_NAMES) {
    const login = deriveLogin(fullName, deterministicSeedId(fullName));
    const user = await masterPrisma.user.upsert({
      where: { login },
      update: {},
      create: { login, passwordHash, fullName },
    });
    const { companyUserId } = await grantTenantRole(membershipRepository, tenantClient, {
      userId: user.id,
      companyId,
      role: USER_ROLE_BIT,
      createdByCompanyUserId: null,
    });

    const existing = await tenantClient.customer.findFirst({ where: { fullName } });
    if (existing) {
      await tenantClient.customer.update({
        where: { id: existing.id },
        data: { active: true, companyUserId },
      });
    } else {
      await tenantClient.customer.create({ data: { fullName, active: true, companyUserId } });
    }
  }

  return { customersUpserted: CUSTOMER_NAMES.length };
}
