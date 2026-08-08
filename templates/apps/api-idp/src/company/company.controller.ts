import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DuplicateCompanySlugError, InvalidCompanyError } from '@store-mgmt/domain';
import { JwtAuthGuard, type AuthenticatedUser } from '@store-mgmt/api-common';
import { CreateCompanySaga } from './create-company.saga.js';
// SECURITY (FIX 4): value import (NOT `import type`) — the global
// `ValidationPipe` needs the real class at runtime via `design:paramtypes`
// for the DTO bound with `@Body()`; a type-only import erases the class and
// Nest silently skips validation/whitelisting for that parameter.
import { CreateCompanyDto } from './dto/create-company.dto.js';
import type { CompanyResponseDto } from './dto/company-response.dto.js';

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
  constructor(private readonly createCompanySaga: CreateCompanySaga) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateCompanyDto): Promise<CompanyResponseDto> {
    return this.withDomainErrorMapping(() =>
      this.createCompanySaga.run({ name: body.name, slug: body.slug, ownerId: req.user.id }),
    );
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
