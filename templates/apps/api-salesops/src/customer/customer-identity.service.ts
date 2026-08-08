import { Inject, Injectable } from '@nestjs/common';
import type {
  Customer as DomainCustomer,
  ICustomerRepository,
  IMembershipRepository,
  IUserRepository,
  UserRoleValue,
} from '@store-mgmt/domain';
import {
  CUSTOMER_REPOSITORY,
  MEMBERSHIP_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLES,
  createCompanyUser,
  createCustomer,
  createUser,
} from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import bcrypt from 'bcrypt';
import type { CreateCustomerWithIdentityDto, CustomerResponseDto } from './dto/index.js';

/** Matches every other password-hashing site in the monorepo (`AuthService`, `UsersService`, the seeds). */
const SALT_ROUNDS = 10;

/**
 * The ONLY authorization an identity minted through the customer path may
 * receive. A module-private constant — NOT a parameter, NOT a default, NOT
 * derived from the request. There is no expression in this file that reads an
 * authorization bit from the body, which is what makes escalation through
 * `POST /customers/with-identity` impossible rather than merely unlikely.
 *
 * This matters more than it looks: `api-salesops` installs no global
 * `ValidationPipe`, so the DTO strips nothing at runtime and an authorization
 * bit sent in the body arrives intact. A guard that READ that bit and rejected
 * it would be one line a future edit could delete; a constant with nowhere to
 * inject an alternative cannot be defeated that way.
 *
 * Same value and same intent as `infra-db/src/customer/seed.ts`'s
 * `USER_ROLE_BIT` — this generalises that seed to the HTTP path.
 */
const CUSTOMER_IDENTITY_ROLE: UserRoleValue = USER_ROLES.user;

/**
 * Signs a walk-in customer up: mints the login, grants it the authorization
 * that makes the login usable, and creates the customer master-data row.
 *
 * `CustomerService` is deliberately untouched by this. The two creation paths
 * have different privilege profiles — `POST /customers` links an EXISTING
 * `userId` and stays closed to a `sales_agent` — and keeping them apart is
 * what lets the agent create customers without ever gaining the power to
 * attach one to somebody else's identity.
 *
 * `CompanyUser` write, Phase 8 / task 8.3: retired off the pre-reshape
 * `COMPANY_USER_REPOSITORY` (`PrismaCompanyUserRepository`, bound to
 * `TenantDefaultPrismaService` — the LEGACY, unmigrated `public.company_user`
 * table). Once `TenantContextGuard` is wired onto this route (this same
 * phase), the caller's REAL request is scoped to a tenant schema
 * (`store_mgmt_tenant_<uuid>`), not `public` — writing through the old
 * repository would silently mint a row nobody's tenant-scoped lookup ever
 * finds. This service now writes the reshaped tenant `CompanyUser` directly
 * through the ACTIVE `runInTenant(req.tenant, ...)` scope the controller
 * opens (design D5), the same way `TenantContextGuard` itself reads tenant
 * `CompanyUser` rows (`tenant-context.guard.ts`) — there is no repository
 * port for tenant `CompanyUser` writes (only `packages/domain`'s validating
 * constructor, `createCompanyUser`), so this mirrors that guard
 * precedent rather than inventing one.
 *
 * ACCESS REQUIRES TWO ROWS. The reshaped model grants access only when an
 * ACTIVE master `Membership` AND a tenant `CompanyUser` both exist
 * (`resolveTenantAccess`, `TenantContextGuard`). The pre-reshape flow wrote
 * `status: 'ACTIVE'` on the `CompanyUser` row and that status WAS the grant;
 * D1 moved status to `Membership`, so this flow writes both. The `Membership`
 * here is the literal translation of the column D1 removed — not the
 * invite-accept flow `packages/domain/src/company/models.ts` defers, which is
 * a different thing: a user accepting access to someone else's company. This
 * is a company minting a user inside its OWN tenant. Drop the `Membership`
 * write and this endpoint hands out credentials that cannot authenticate
 * anywhere.
 */
@Injectable()
export class CustomerIdentityService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepository: ICustomerRepository,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: IMembershipRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * `actor` is derived from the AUTHENTICATED caller (`req.user`), never
   * request-body data — it supplies the provisioning audit trail
   * (`createdByCompanyUserId`). Tenant SCOPE is NOT a field here: the caller
   * (`CustomerIdentityController`) already opened it via
   * `runInTenant(req.tenant, ...)` before calling this method (design D5) —
   * `this.tenantContext.getClient()` below resolves from THAT active scope.
   *
   * The three writes are NOT transactional, and the ORDER is the design:
   *  1. `User` — a duplicate login fires here, before anything is written, so
   *     the common failure costs nothing and leaves nothing behind.
   *  2. `CompanyUser` — the tenant-scoped role assignment (see the KNOWN GAP
   *     note on the class above: this alone is not yet sufficient for the new
   *     login to authenticate).
   *  3. `Customer` — failing here leaves an ordinary `user`-role account with
   *     no customer row: harmless, and re-runnable under a different login.
   *
   * Every reachable partial state is loud and harmless, which is why this
   * needs no unit-of-work port.
   */
  async createWithIdentity(
    actor: { readonly companyUserId: string; readonly companyId: string },
    dto: CreateCustomerWithIdentityDto,
  ): Promise<CustomerResponseDto> {
    const userInput = {
      login: dto.login,
      passwordHash: await bcrypt.hash(dto.password, SALT_ROUNDS),
      fullName: dto.fullName,
      email: dto.email,
      cellPhone: dto.cellPhone,
    };
    // Invariant check only, discarded — mirrors `UsersService.create` and
    // `CustomerService.create`. The repository/DB stays the source of truth.
    createUser(userInput);
    const user = await this.userRepository.create(userInput);

    // Invariant check only, discarded (same pattern as `createUser` above) —
    // `id` IS the master `User.id` just minted (design D1's collapsed PK),
    // never independently generated.
    createCompanyUser({
      id: user.id,
      role: CUSTOMER_IDENTITY_ROLE,
      createdByCompanyUserId: actor.companyUserId,
    });
    // Direct tenant Prisma write — no repository port exists for tenant
    // `CompanyUser` (see the class doc comment). No `companyId`/`status`
    // field: company identity is the ACTIVE `runInTenant` scope this call
    // resolves from, not a column (spec: "CompanyUser Collapsed-PK Shape");
    // status lives solely on master `Membership`, which this flow does not
    // create (see the KNOWN GAP note above).
    await this.tenantContext.getClient().companyUser.create({
      data: {
        id: user.id,
        role: CUSTOMER_IDENTITY_ROLE,
        createdByCompanyUserId: actor.companyUserId,
      },
    });

    // The master half of the access grant. `companyId` comes from the
    // AUTHENTICATED actor (`req.user.companyId`, set by `TenantContextGuard`),
    // never from the request body — a caller must not be able to mint a
    // membership into a company it does not belong to.
    await this.membershipRepository.create({
      userId: user.id,
      companyId: actor.companyId,
      status: 'ACTIVE',
    });

    // Mapped field by field, never spread: the body carries `login`/`password`
    // (and whatever else a caller invented), none of which belong in customer
    // master data. An explicit mapping is also the reason a smuggled
    // `companyUserId` cannot reach the repository — the link is the identity
    // just minted. `companyUserId: user.id` because `CompanyUser.id` IS the
    // master `User.id` (design.md D1) — same value the pre-reshape `userId`
    // link used, only the field name and FK target changed.
    const customerInput = {
      companyUserId: user.id,
      fullName: dto.fullName,
      documentId: dto.documentId,
      cellPhone: dto.cellPhone,
      email: dto.email,
      address: dto.address,
      note: dto.note,
    };
    createCustomer(customerInput);
    return this.toResponse(await this.customerRepository.create(customerInput));
  }

  /**
   * Intentionally duplicated from `CustomerService` rather than extracted:
   * that class is the untouched existing path, and reaching into it to share a
   * private mapper would couple the two creation flows this design keeps
   * apart. The shape is fixed by `CustomerResponseDto`, so the duplication
   * cannot drift silently.
   */
  private toResponse(customer: DomainCustomer): CustomerResponseDto {
    return {
      id: customer.id,
      // `CustomerResponseDto.userId` is the external API contract (unchanged)
      // — sourced from the domain's `companyUserId` post-D1 reshape.
      userId: customer.companyUserId,
      fullName: customer.fullName,
      documentId: customer.documentId,
      cellPhone: customer.cellPhone,
      email: customer.email,
      address: customer.address,
      note: customer.note,
      active: customer.active,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }
}
