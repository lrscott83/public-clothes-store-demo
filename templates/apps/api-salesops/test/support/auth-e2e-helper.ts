import { randomUUID } from 'node:crypto';
import { JWT_CONFIG } from '@store-mgmt/api-common';
import { USER_ROLES } from '@store-mgmt/domain';
import type { PrismaService } from '@store-mgmt/infra-db';
import jwt, { type SignOptions } from 'jsonwebtoken';

/** Bcrypt hash shape accepted by the domain `passwordHash` invariant — never a real credential (mirrors `test/customer.e2e-spec.ts`). */
const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

/**
 * Mints a REAL `User` row (via Prisma, same DB the app connects to) plus a
 * REAL access JWT signed with the shared `JWT_SECRET` (`JWT_CONFIG`, from
 * `@store-mgmt/api-common` — the exact secret `JwtStrategy` verifies with).
 * No round-trip to `apps/api-idp` needed: this app trusts the signature
 * locally (design.md's "Consumers verify tokens locally" requirement), so
 * signing directly with the shared secret is a faithful e2e substitute for
 * an actual login.
 */
export async function createAuthedUser(
  prisma: PrismaService,
  roles: number,
): Promise<{ userId: string; companyUserId: string; token: string }> {
  const user = await prisma.user.create({
    data: {
      login: `e2e.${randomUUID()}`,
      passwordHash: VALID_HASH,
      fullName: 'E2E Test User',
    },
  });

  // `JwtStrategy` resolves the role bitmask from the user's ACTIVE
  // `CompanyUser` assignment and 403s without one, so an e2e user is only
  // usable once it has been assigned. The Company is upserted by slug because
  // specs wipe users between tests but not necessarily the company row.
  const company = await prisma.company.upsert({
    where: { slug: 'default' },
    update: {},
    create: { name: 'Tienda Prueba', slug: 'default' },
  });
  // Returned alongside the user id because sales attribution is recorded
  // against THIS id, not the User id — an e2e spec asserting attribution has
  // no other way to know the expected value.
  const assignment = await prisma.companyUser.create({
    data: { userId: user.id, companyId: company.id, role: roles, status: 'ACTIVE' },
  });

  // `JWT_CONFIG.signOptions.expiresIn` is a plain `string` in api-common
  // (env-var friendly); `jsonwebtoken`'s `SignOptions` types it against the
  // stricter `StringValue` template-literal type. The runtime value
  // (`'15m'`) is valid either way — this cast only bridges the two type
  // definitions (same bridge `apps/api-idp/src/auth/auth.module.ts` uses).
  const token = jwt.sign({ sub: user.id, login: user.login }, JWT_CONFIG.secret, {
    expiresIn: JWT_CONFIG.signOptions.expiresIn,
  } as SignOptions);

  return { userId: user.id, companyUserId: assignment.id, token };
}

/** `supertest`'s `.set(...authHeader(token))` — a valid `Authorization: Bearer <token>` header pair. */
export function authHeader(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}

/**
 * Mints a `warehouse_operator` user PLUS its `WarehouseOperator` detail row
 * (`userId` PK/FK, scoped to `warehouseId`) — there is no admin endpoint for
 * this yet (out of Phase 5 scope), so e2e specs insert the row directly via
 * Prisma, same discipline as `createAuthedUser`.
 */
export async function createAuthedWarehouseOperator(
  prisma: PrismaService,
  warehouseId: string,
): Promise<{ userId: string; companyUserId: string; token: string }> {
  const { userId, companyUserId, token } = await createAuthedUser(prisma, USER_ROLES.warehouse_operator);
  await prisma.warehouseOperator.create({ data: { userId, warehouseId } });
  return { userId, companyUserId, token };
}
