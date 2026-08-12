import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { COMPANY_REPOSITORY, DuplicateCompanySlugError, InvalidCompanyError, type ICompanyRepository } from '@store-mgmt/domain';
import { JwtAuthGuard, type AuthenticatedUser } from '@store-mgmt/api-common';
import { CreateCompanySaga } from './create-company.saga.js';
// SECURITY (FIX 4): value import (NOT `import type`) — the global
// `ValidationPipe` needs the real class at runtime via `design:paramtypes`
// for the DTO bound with `@Body()`; a type-only import erases the class and
// Nest silently skips validation/whitelisting for that parameter.
import { CreateCompanyDto } from './dto/create-company.dto.js';
import type { CompanyResponseDto } from './dto/company-response.dto.js';
import type { CompanyLookupResponseDto } from './dto/company-lookup-response.dto.js';

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

/**
 * The saga's caller (design.md D7) — an already-authenticated `User`
 * provisions and becomes the OWNER of their own `Company`. Guarded by
 * `JwtAuthGuard` ONLY: no `TenantContextGuard`/`RolesGuard` here, because no
 * tenant exists yet for this request — that is exactly what this endpoint
 * creates. Mirrors poolops-biz's split (signup creates only a `User`; this
 * is the separate, authenticated company-creation action) — see engram
 * `reference/poolops-signup-company-split`.
 */
@Controller('companies')
export class CompanyController {
  constructor(
    private readonly createCompanySaga: CreateCompanySaga,
    @Inject(COMPANY_REPOSITORY) private readonly companyRepository: ICompanyRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateCompanyDto): Promise<CompanyResponseDto> {
    return this.withDomainErrorMapping(() =>
      this.createCompanySaga.run({ name: body.name, slug: body.slug, ownerId: req.user.id }),
    );
  }

  /**
   * Resolves a slug to `{id, slug, name}` (design gap found during
   * public-catalog Phase 6 task 6.5: `web-catalog`'s admin needs the
   * tenant's `companyId` to send as `X-Company-Id` on `api-salesops`
   * calls, and cannot rely on `TenantContextGuard`'s ambiguous
   * single-membership fallback once an admin belongs to >1 company).
   * `JwtAuthGuard` ONLY — same reasoning as `POST /companies`: resolving
   * a slug must work BEFORE any tenant is established for the request.
   */
  @Get(':slug')
  @UseGuards(JwtAuthGuard)
  async findBySlug(@Param('slug') slug: string): Promise<CompanyLookupResponseDto> {
    const company = await this.companyRepository.findBySlug(slug);
    if (!company) {
      throw new NotFoundException();
    }
    return { id: company.id, slug: company.slug, name: company.name };
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidCompanyError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof DuplicateCompanySlugError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
