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
import { JwtAuthGuard, Roles, RolesGuard, type SanitizedUser } from '@store-mgmt/api-common';
import { RoleHelpers, USER_ROLES } from '@store-mgmt/domain';
import type { UserResponseDto } from '../auth/dto/user-response.dto.js';
// SECURITY (FIX 4): these MUST be value imports, not `import type` — the
// global `ValidationPipe` relies on `reflect-metadata`'s `design:paramtypes`
// to know the real DTO class for each `@Body()` param. A type-only import is
// erased by the TS compiler, so the runtime metatype degrades to `Object`
// and NestJS silently skips validation/whitelisting entirely.
import { CreateUserDto, UpdateUserDto } from './dto/index.js';
import { UsersService } from './users.service.js';

interface AuthenticatedRequest extends Request {
  user: SanitizedUser;
}

/**
 * Admin/owner-only user administration (design.md §6/locked matrix: `admin`
 * is system super-root, `owner` manages its own business's users).
 * `@UseGuards(JwtAuthGuard, RolesGuard)` order matters: an unauthenticated
 * request is rejected 401 by `JwtAuthGuard` BEFORE `RolesGuard` ever runs.
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(USER_ROLES.admin, USER_ROLES.owner)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateUserDto): Promise<UserResponseDto> {
    assertNoUnauthorizedAdminGrant(req.user.roles, body.roles);
    return this.usersService.create(body);
  }

  @Get()
  async list(): Promise<UserResponseDto[]> {
    return this.usersService.list();
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
  ): Promise<UserResponseDto> {
    assertNoUnauthorizedAdminGrant(req.user.roles, body.roles);
    return this.usersService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deactivate(@Param('id') id: string): Promise<UserResponseDto> {
    return this.usersService.deactivate(id);
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
