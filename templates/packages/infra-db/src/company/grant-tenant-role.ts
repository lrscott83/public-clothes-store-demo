import type { IMembershipRepository } from '@store-mgmt/domain';
import { createCompanyUser } from '@store-mgmt/domain';
import type { PrismaClient as TenantPrismaClient } from '../../generated/tenant/client.js';

export interface GrantTenantRoleInput {
  /** Master `User.id` receiving the grant — becomes the tenant `CompanyUser.id` (design D1). */
  readonly userId: string;
  readonly companyId: string;
  readonly role: number;
  /** `CompanyUser.id` of whoever provisioned this grant. `null` for seed/saga-owner rows. */
  readonly createdByCompanyUserId: string | null;
}

export interface GrantTenantRoleResult {
  readonly companyUserId: string;
  readonly membershipId: string;
}

/**
 * Writes BOTH halves of tenant access (design D1/D4): an ACTIVE master
 * `Membership` and a tenant `CompanyUser`. Mirrors the write shape
 * `CustomerIdentityService.createWithIdentity` (task 8.3) and
 * `UsersService.create` (task 10.4) already established — no repository
 * port exists for tenant `CompanyUser` writes, only `packages/domain`'s
 * validating constructor `createCompanyUser`, so this reuses that same
 * precedent instead of inventing a new one. Extracted here (task 14.2) so
 * `prisma/seed.js`'s cockpit-account/demo-customer seeding does not
 * hand-roll a THIRD copy of this exact two-write pattern.
 *
 * Idempotent: re-running with the same `userId`/`companyId` reuses the
 * existing `Membership` (never duplicates — `(userId, companyId)` is
 * unique) and updates the existing tenant `CompanyUser`'s `role` in place
 * rather than failing on `CompanyUser.id`'s primary key.
 */
export async function grantTenantRole(
  membershipRepository: IMembershipRepository,
  tenantClient: TenantPrismaClient,
  input: GrantTenantRoleInput,
): Promise<GrantTenantRoleResult> {
  const membership =
    (await membershipRepository.findByUserAndCompany(input.userId, input.companyId)) ??
    (await membershipRepository.create({
      userId: input.userId,
      companyId: input.companyId,
      status: 'ACTIVE',
    }));

  const existing = await tenantClient.companyUser.findUnique({ where: { id: input.userId } });
  if (existing) {
    const updated = await tenantClient.companyUser.update({
      where: { id: input.userId },
      data: { role: input.role },
    });
    return { companyUserId: updated.id, membershipId: membership.id };
  }

  // Invariant check only, discarded — mirrors CustomerIdentityService/the saga.
  createCompanyUser({
    id: input.userId,
    role: input.role,
    createdByCompanyUserId: input.createdByCompanyUserId,
  });
  const created = await tenantClient.companyUser.create({
    data: {
      id: input.userId,
      role: input.role,
      createdByCompanyUserId: input.createdByCompanyUserId,
    },
  });
  return { companyUserId: created.id, membershipId: membership.id };
}
