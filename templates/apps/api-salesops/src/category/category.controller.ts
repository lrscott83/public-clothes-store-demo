import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard, TenantContextGuard, createRunInTenant } from '@store-mgmt/api-common';
import { InvalidCategoryError, USER_ROLES } from '@store-mgmt/domain';
import { TenantContextService, type TenantContext } from '@store-mgmt/infra-db';
import type { Request } from 'express';
import { CategoryService } from './category.service.js';
import type { CategoryResponseDto, CreateCategoryDto, UpdateCategoryDto } from './dto/index.js';

/** `Request` carrying `req.tenant`, set by `TenantContextGuard` (design D4/D5). */
type TenantScopedRequest = Request & { tenant: TenantContext };

/**
 * REST delivery for the Category module. Maps `InvalidCategoryError` -> 400
 * (e.g. duplicate slug) and a not-found lookup -> 404. `DELETE` always
 * soft-deletes (`active=false`) — never a hard DELETE. Catalog reads are
 * open to any authenticated user; writes are `owner`/`admin`-only
 * (backend-users-roles permission matrix).
 */
@Controller('categories')
@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)
export class CategoryController {
  private readonly runInTenant: ReturnType<typeof createRunInTenant>;

  constructor(
    private readonly categoryService: CategoryService,
    tenantContext: TenantContextService,
  ) {
    this.runInTenant = createRunInTenant(tenantContext);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async create(
    @Body() body: CreateCategoryDto,
    @Req() req: TenantScopedRequest,
  ): Promise<CategoryResponseDto> {
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.categoryService.create(body)),
    );
  }

  @Get()
  async list(
    @Query('includeInactive') includeInactive: string | undefined,
    @Req() req: TenantScopedRequest,
  ): Promise<CategoryResponseDto[]> {
    return this.runInTenant(req.tenant, () => this.categoryService.list(includeInactive === 'true'));
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
  ): Promise<CategoryResponseDto> {
    return this.runInTenant(req.tenant, async () => {
      const found = await this.categoryService.findById(id);
      if (!found) {
        throw new NotFoundException(`Category "${id}" not found`);
      }
      return found;
    });
  }

  @Patch(':id')
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateCategoryDto,
    @Req() req: TenantScopedRequest,
  ): Promise<CategoryResponseDto> {
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.categoryService.update(id, body)),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async softDelete(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
  ): Promise<{ id: string }> {
    await this.runInTenant(req.tenant, () => this.categoryService.softDelete(id));
    return { id };
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidCategoryError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
