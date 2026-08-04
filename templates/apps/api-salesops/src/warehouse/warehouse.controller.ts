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
import { InvalidWarehouseError, USER_ROLES } from '@store-mgmt/domain';
import { TenantContextService, type TenantContext } from '@store-mgmt/infra-db';
import type { Request } from 'express';
import { WarehouseService } from './warehouse.service.js';
import type { CreateWarehouseDto, UpdateWarehouseDto, WarehouseResponseDto } from './dto/index.js';

/** `Request` carrying `req.tenant`, set by `TenantContextGuard` (design D4/D5). */
type TenantScopedRequest = Request & { tenant: TenantContext };

/**
 * REST delivery for the Warehouse module. Maps `InvalidWarehouseError` -> 400
 * (e.g. empty name). `DELETE` always soft-deletes (`active=false`) — never a
 * hard DELETE. Mirrors `CategoryController`. Reads are open to any
 * authenticated user; writes are `owner`/`admin`-only (backend-users-roles
 * permission matrix).
 */
@Controller('warehouses')
@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)
export class WarehouseController {
  private readonly runInTenant: ReturnType<typeof createRunInTenant>;

  constructor(
    private readonly warehouseService: WarehouseService,
    tenantContext: TenantContextService,
  ) {
    this.runInTenant = createRunInTenant(tenantContext);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async create(
    @Body() body: CreateWarehouseDto,
    @Req() req: TenantScopedRequest,
  ): Promise<WarehouseResponseDto> {
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.warehouseService.create(body)),
    );
  }

  @Get()
  async list(
    @Query('includeInactive') includeInactive: string | undefined,
    @Req() req: TenantScopedRequest,
  ): Promise<WarehouseResponseDto[]> {
    return this.runInTenant(req.tenant, () => this.warehouseService.list(includeInactive === 'true'));
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
  ): Promise<WarehouseResponseDto> {
    return this.runInTenant(req.tenant, async () => {
      const found = await this.warehouseService.findById(id);
      if (!found) {
        throw new NotFoundException(`Warehouse "${id}" not found`);
      }
      return found;
    });
  }

  @Patch(':id')
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateWarehouseDto,
    @Req() req: TenantScopedRequest,
  ): Promise<WarehouseResponseDto> {
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.warehouseService.update(id, body)),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async softDelete(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
  ): Promise<{ id: string }> {
    await this.runInTenant(req.tenant, () => this.warehouseService.softDelete(id));
    return { id };
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidWarehouseError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
