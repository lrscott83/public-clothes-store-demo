import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  JwtAuthGuard,
  Roles,
  RolesGuard,
  TenantContextGuard,
  createRunInTenant,
  type SanitizedUser,
} from '@store-mgmt/api-common';
import { RoleHelpers, USER_ROLES } from '@store-mgmt/domain';
import { TenantContextService, type TenantContext } from '@store-mgmt/infra-db';
import type { UserResponseDto } from '../auth/dto/user-response.dto.js';
// SECURITY (FIX 4): these MUST be value imports, not `import type` — the
// global `ValidationPipe` relies on `reflect-metadata`'s `design:paramtypes`
// to know the real DTO class for each `@Body()` param. A type-only import is
// erased by the TS compiler, so the runtime metatype degrades to `Object`
// and NestJS silently skips validation/whitelisting entirely.
import { CreateUserDto, UpdateUserDto } from './dto/index.js';
import { UsersService } from './users.service.js';

/** `Request` carrying the `req.user` populated by `JwtStrategy`/`TenantContextGuard` and `req.tenant` set by `TenantContextGuard` — never carries `passwordHash`. */
interface AuthenticatedRequest extends Request {
  user: SanitizedUser;
  tenant: TenantContext;
}

/**
 * Admin/owner-only user administration (design.md §6/locked matrix: `admin`
 * is system super-root, `owner` manages its own business's users).
 * `@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)` order matters:
 * an unauthenticated request is rejected 401 by `JwtAuthGuard` before
 * `TenantContextGuard` ever resolves a tenant, and `RolesGuard`'s
 * `req.user.roles` check depends on `TenantContextGuard` having already run
 * (design D4's GUARD-ORDER INVARIANT, `jwt.strategy.ts`).
 *
 * `TenantContextGuard` added task 10.4, alongside `UsersService`'s
 * retirement of the pre-reshape `CompanyUser` shape (design D1) — every
 * role write/read this controller triggers now resolves the tenant
 * `CompanyUser` from an ACTIVE `runInTenant` scope (design D5), which does
 * not exist without this guard in the chain.
 */
@Controller('users')
@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)
@Roles(USER_ROLES.admin, USER_ROLES.owner)
export class UsersController {
  private readonly runInTenant: ReturnType<typeof createRunInTenant>;

  constructor(
    private readonly usersService: UsersService,
    tenantContext: TenantContextService,
  ) {
    this.runInTenant = createRunInTenant(tenantContext);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateUserDto): Promise<UserResponseDto> {
    assertNoUnauthorizedAdminGrant(req.user.roles, body.roles);
    // Role writes are scoped to the CALLER's company — never to a company id
    // taken from the request body, which would let an admin of one company
    // write assignments into another. `companyUserId` is the provenance
    // stamp on the new tenant CompanyUser row (never request-body data).
    return this.runInTenant(req.tenant, () =>
      this.usersService.create({ companyId: req.user.companyId, companyUserId: req.user.companyUserId }, body),
    );
  }

  @Get()
  async list(@Req() req: AuthenticatedRequest): Promise<UserResponseDto[]> {
    return this.runInTenant(req.tenant, () => this.usersService.list(req.user.companyId));
  }

  @Get(':id')
  async findById(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<UserResponseDto> {
    return this.runInTenant(req.tenant, () => this.usersService.findById(id));
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
  ): Promise<UserResponseDto> {
    assertNoUnauthorizedAdminGrant(req.user.roles, body.roles);
    return this.runInTenant(req.tenant, () => this.usersService.update(id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<UserResponseDto> {
    return this.runInTenant(req.tenant, () => this.usersService.deactivate(id));
  }
}

/**
 * SECURITY (FIX 3 — privilege ceiling): a caller who does NOT hold `admin`
 * may NEVER set the `admin` bit on a create OR update payload — otherwise an
 * `owner` (or any other `@Roles(admin, owner)`-admitted caller) could mint or
 * self-promote to system super-root. `admin` itself is exempt (it can grant
 * anything). A `roles` value of `undefined` (field omitted) is a no-op —
 * nothing to check.
 */
function assertNoUnauthorizedAdminGrant(callerRoles: number, requestedRoles: number | undefined): void {
  if (requestedRoles === undefined) return;
  if (!RoleHelpers.hasRole(requestedRoles, USER_ROLES.admin)) return;
  if (RoleHelpers.hasRole(callerRoles, USER_ROLES.admin)) return;

  throw new ForbiddenException('Only an admin caller may grant the admin role.');
}
