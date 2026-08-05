import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type {
  CreateUserInput,
  IMembershipRepository,
  IUserRepository,
  User as DomainUser,
  UserRoleValue,
} from '@store-mgmt/domain';
import {
  DuplicateLoginError,
  MEMBERSHIP_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLES,
  createTenantCompanyUser,
  createUser,
} from '@store-mgmt/domain';
import { TenantContextService } from '@store-mgmt/infra-db';
import type { UserResponseDto } from '../auth/dto/user-response.dto.js';
import { userToResponseDto } from '../auth/mappers/user.mapper.js';
import type { CreateUserDto, UpdateUserDto } from './dto/index.js';

const SALT_ROUNDS = 10;

/**
 * Admin/owner-only user administration (design.md §6/locked matrix — `admin`
 * is system super-root, `owner` manages its own business's users).
 * `@Roles(admin, owner)` is enforced at the controller (`UsersController`),
 * NOT here — this service is the orchestration layer only.
 *
 * ACCESS REQUIRES TWO ROWS (design D1, task 10.4). Role writes go to the
 * tenant `CompanyUser` (the bitmask), and the master `Membership` (the
 * ACTIVE/status grant) — retired off the pre-reshape, master-only
 * `ICompanyUserRepository` (`COMPANY_USER_REPOSITORY`), which carried both
 * role AND status on one row and is gone from this service entirely (task
 * 6.5's audit named this file as an untouched consumer; see tasks.md Phase
 * 10). Mirrors `CustomerIdentityService.createWithIdentity` (task 8.3): the
 * tenant `CompanyUser` write goes straight through
 * `TenantContextService.getClient()` — no repository port exists for it,
 * only `packages/domain`'s validating constructor
 * (`createTenantCompanyUser`) — because that write is only ever valid INSIDE
 * an already-open tenant scope, and there is no schema-agnostic way to
 * express "the tenant CompanyUser repository" as a DI-bound singleton.
 *
 * The tenant scope itself is NOT a parameter here: `UsersController` opens
 * it via `runInTenant(req.tenant, ...)` (design D5) before calling in, same
 * as `CustomerIdentityController` — `this.tenantContext.getClient()` below
 * resolves from that ACTIVE scope, never from an argument.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(MEMBERSHIP_REPOSITORY) private readonly membershipRepository: IMembershipRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Admin/owner-created user WITH an explicit `roles` bitmask (unlike public
   * `AuthService.signup`, always `user`-role). `actor` is the AUTHENTICATED
   * caller (`req.user`), never request-body data — `companyId` scopes the
   * new Membership to the caller's own company, `companyUserId` is the
   * provenance stamp on the tenant CompanyUser row (mirrors
   * `CustomerIdentityService`'s `actor` parameter).
   *
   * Write order — User -> tenant CompanyUser -> master Membership — is NOT
   * transactional. Every reachable partial state is loud and harmless: a
   * User with no CompanyUser/Membership cannot authenticate anywhere
   * (`TenantContextGuard`'s `NO_ACTIVE_MEMBERSHIP`/`MISSING_COMPANY_USER`
   * 403s), same precedent as `CustomerIdentityService.createWithIdentity`.
   */
  async create(
    actor: { readonly companyId: string; readonly companyUserId: string },
    dto: CreateUserDto,
  ): Promise<UserResponseDto> {
    const role = dto.roles ?? USER_ROLES.user;
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const input: CreateUserInput = {
      login: dto.login,
      passwordHash,
      fullName: dto.fullName,
      email: dto.email,
      cellPhone: dto.cellPhone,
    };
    createUser(input); // invariant check only, discarded (mirrors AuthService.signup / CustomerService)

    let created: DomainUser;
    try {
      created = await this.userRepository.create(input);
    } catch (err) {
      if (err instanceof DuplicateLoginError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }

    // Invariant check only, discarded (mirrors CustomerIdentityService) —
    // `id` IS the master `User.id` just minted (design D1's collapsed PK).
    createTenantCompanyUser({ id: created.id, role, createdByCompanyUserId: actor.companyUserId });
    await this.tenantContext.getClient().companyUser.create({
      data: { id: created.id, role, createdByCompanyUserId: actor.companyUserId },
    });

    await this.membershipRepository.create({
      userId: created.id,
      companyId: actor.companyId,
      status: 'ACTIVE',
    });

    return userToResponseDto(created, role);
  }

  /**
   * Lists the CALLER's company: `Membership.listByCompany` (master) names
   * WHO belongs to this company, then the tenant `CompanyUser` rows (read
   * from the ACTIVE `runInTenant` scope the controller already opened)
   * supply each member's role. Replaces the pre-reshape version, which
   * listed EVERY user ever registered and reported role 0 for every one not
   * in the caller's company — company-scoped end to end now, not a global
   * scan filtered after the fact.
   */
  async list(companyId: string): Promise<UserResponseDto[]> {
    const memberships = await this.membershipRepository.listByCompany(companyId);
    if (memberships.length === 0) {
      return [];
    }

    const companyUsers = await this.tenantContext.getClient().companyUser.findMany({
      where: { id: { in: memberships.map((m) => m.userId) } },
    });
    const roleById = new Map(companyUsers.map((cu) => [cu.id, cu.role]));

    const users = await Promise.all(memberships.map((m) => this.userRepository.findById(m.userId)));
    return users
      .filter((user): user is DomainUser => user !== null)
      .map((user) => userToResponseDto(user, this.roleFor(user.id, roleById.get(user.id))));
  }

  /**
   * By-id lookup, unscoped by company (unchanged from the pre-reshape
   * behavior — the caller-company check this route never had is a
   * pre-existing gap, not one task 10.4 introduces or fixes). The reported
   * role is now resolved from the tenant `CompanyUser` in the CALLER's
   * ambient scope (`runInTenant`), so it reflects that user's role in the
   * CALLER's company — 0 (logged) if the looked-up user has none there.
   */
  async findById(id: string): Promise<UserResponseDto> {
    const found = await this.userRepository.findById(id);
    if (!found) {
      throw new NotFoundException(`User "${id}" not found`);
    }
    return userToResponseDto(found, await this.currentRole(id));
  }

  async update(id: string, patch: UpdateUserDto): Promise<UserResponseDto> {
    const existing = await this.userRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`User "${id}" not found`);
    }

    // `roles` is deliberately NOT forwarded: it is not part of
    // `UserUpdateInput` since migration 002, and the tenant CompanyUser
    // write below is the only place a role change is persisted.
    const updated = await this.userRepository.update(id, {
      ...(patch.fullName !== undefined ? { fullName: patch.fullName } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.cellPhone !== undefined ? { cellPhone: patch.cellPhone } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    });

    // `roles` is optional on the patch — only touch the assignment when the
    // caller actually asked to change it. Scoped implicitly to the CALLER's
    // company: the write lands in whichever tenant schema `runInTenant`
    // opened, never a `companyId` argument (design D1 — company identity is
    // the schema, not a column).
    if (patch.roles !== undefined) {
      await this.tenantContext.getClient().companyUser.update({
        where: { id },
        data: { role: patch.roles },
      });
      return userToResponseDto(updated, patch.roles);
    }

    return userToResponseDto(updated, await this.currentRole(id));
  }

  /** Deactivates (soft) a user — sets `isActive=false`. Never a hard delete (mirrors `CustomerService.softDelete`). */
  async deactivate(id: string): Promise<UserResponseDto> {
    const existing = await this.userRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`User "${id}" not found`);
    }
    const updated = await this.userRepository.update(id, { isActive: false });
    return userToResponseDto(updated, await this.currentRole(id));
  }

  /**
   * Reads the tenant `CompanyUser` for `userId` from the ACTIVE
   * `runInTenant` scope — same lookup shape as `TenantContextGuard`'s own
   * `findTenantCompanyUser` (`packages/api-common/src/auth/tenant-context.guard.ts`).
   */
  private async currentRole(userId: string): Promise<UserRoleValue> {
    const companyUser = await this.tenantContext.getClient().companyUser.findUnique({ where: { id: userId } });
    return this.roleFor(userId, companyUser?.role);
  }

  /**
   * An administrative READ must not 500 because a user has no assignment — but
   * it must not invent permissions either. Reports 0 (no permissions, which is
   * the truth: that user cannot authenticate, `TenantContextGuard` 403s them)
   * and logs the inconsistency so it is visible rather than merely absent.
   */
  private roleFor(userId: string, role: UserRoleValue | undefined): UserRoleValue {
    if (role === undefined) {
      this.logger.error(`MISSING_COMPANY_USER: user ${userId} has no tenant CompanyUser in the active scope`);
      return 0;
    }
    return role;
  }
}
