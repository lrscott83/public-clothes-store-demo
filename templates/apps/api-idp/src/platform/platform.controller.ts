import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard, type AuthenticatedUser } from '@store-mgmt/api-common';
// SECURITY (FIX 4): value import (NOT `import type`) — the global
// `ValidationPipe` needs the real class at runtime via `design:paramtypes`
// for the DTO bound with `@Body()`; a type-only import erases the class and
// Nest silently skips validation/whitelisting for that parameter.
import { CreatePlatformCompanyDto } from './dto/create-platform-company.dto.js';
import { PlatformService } from './platform.service.js';
import { SuperadminGuard } from './superadmin.guard.js';

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

/** Wire shape of a listed company — never leaks `schemaName`. */
export interface PlatformCompanyDto {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  type: 'catalog' | null;
}

export interface PlatformCompanyCreatedDto {
  company: {
    id: string;
    name: string;
    slug: string;
    type: 'catalog' | null;
  };
  ownerLogin: string;
  /** Plaintext — appears in EXACTLY this one response, never again. */
  temporaryPassword: string;
}

/**
 * Platform superadmin endpoints (spec: salesops-platform "List Companies
 * Endpoint", "Create Company On Behalf Endpoint"). Guard chain is
 * `JwtAuthGuard → SuperadminGuard` ONLY — deliberately NO
 * `TenantContextGuard`/`RolesGuard`, because a superadmin has NO Membership
 * anywhere and `RolesGuard` hard-fails tenant-less requests by design
 * (design D1). An unauthenticated request gets its 401 from `JwtAuthGuard`
 * and never reaches the identity gate.
 *
 * The list returns ALL companies (design D2 — no pagination) including
 * inactive/unprovisioned (`schemaName=null`) ones. The create route composes
 * owner-User creation with the UNTOUCHED `CreateCompanySaga` (design D3) —
 * composition lives in `PlatformService`.
 */
@Controller('platform')
@UseGuards(JwtAuthGuard, SuperadminGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('companies')
  async list(): Promise<PlatformCompanyDto[]> {
    const companies = await this.platformService.listCompanies();
    return companies.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      isActive: c.isActive,
      type: c.type,
    }));
  }

  @Post('companies')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() _req: AuthenticatedRequest,
    @Body() body: CreatePlatformCompanyDto,
  ): Promise<PlatformCompanyCreatedDto> {
    const result = await this.platformService.createOnBehalf({
      name: body.name,
      slug: body.slug,
      type: body.type,
      ownerLogin: body.ownerLogin,
      temporaryPassword: body.temporaryPassword,
    });
    return {
      company: {
        id: result.company.id,
        name: result.company.name,
        slug: result.company.slug,
        type: result.company.type,
      },
      ownerLogin: result.ownerLogin,
      // Show-once semantics: this plaintext exists only in THIS response.
      temporaryPassword: result.temporaryPassword,
    };
  }
}
