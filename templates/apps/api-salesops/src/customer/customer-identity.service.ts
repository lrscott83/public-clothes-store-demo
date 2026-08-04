import { Inject, Injectable } from '@nestjs/common';
import type {
  Customer as DomainCustomer,
  ICompanyUserRepository,
  ICustomerRepository,
  IUserRepository,
  UserRoleValue,
} from '@store-mgmt/domain';
import {
  COMPANY_USER_REPOSITORY,
  CUSTOMER_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLES,
  createCustomer,
  createUser,
} from '@store-mgmt/domain';
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
 */
@Injectable()
export class CustomerIdentityService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(COMPANY_USER_REPOSITORY)
    private readonly companyUserRepository: ICompanyUserRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepository: ICustomerRepository,
  ) {}

  /**
   * `actor` is the AUTHENTICATED caller (`req.user`), never request-body data.
   * It supplies both the tenant scope and the provisioning audit trail.
   *
   * The three writes are NOT transactional, and the ORDER is the design:
   *  1. `User` — a duplicate login fires here, before anything is written, so
   *     the common failure costs nothing and leaves nothing behind.
   *  2. `CompanyUser` — without it the login is dead: since `app_user.roles`
   *     was dropped, `JwtStrategy` refuses a user with no ACTIVE assignment.
   *     Failing here therefore leaves an account that 403s loudly, not one
   *     that silently authenticates with no permissions.
   *  3. `Customer` — failing here leaves an ordinary `user`-role account with
   *     no customer row: harmless, and re-runnable under a different login.
   *
   * Every reachable partial state is loud and harmless, which is why this
   * needs no unit-of-work port.
   */
  async createWithIdentity(
    actor: { readonly companyId: string; readonly companyUserId: string },
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

    await this.companyUserRepository.create({
      userId: user.id,
      companyId: actor.companyId,
      role: CUSTOMER_IDENTITY_ROLE,
      status: 'ACTIVE',
      createdByCompanyUserId: actor.companyUserId,
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
