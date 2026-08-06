import {
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
import { USER_ROLES } from '@store-mgmt/domain';
import { TenantContextService, type TenantContext } from '@store-mgmt/infra-db';
import type { Request } from 'express';
import { DeliveryService } from './delivery.service.js';
import type { CarrierResponseDto, CreateCarrierDto, UpdateCarrierDto } from './dto/index.js';

/** `Request` carrying `req.tenant`, set by `TenantContextGuard` (design D4/D5). */
type TenantScopedRequest = Request & { tenant: TenantContext };

/**
 * REST delivery for the Carrier catalog. Reads carry no `@Roles` — open to
 * any authenticated tenant user, mirroring `product.controller.ts`/
 * `warehouse.controller.ts` (spec: "Any authenticated tenant user can read
 * carriers"). Writes (`POST`/`PATCH`/soft-`DELETE`) require `owner`/`admin`
 * (spec: "Carrier Catalog Roles Mirror Existing Master Data"). `DELETE`
 * always soft-deletes (`active=false`) — never a hard DELETE. No domain
 * error mapping here — `createCarrier()` defines no runtime rejection (see
 * its doc comment), unlike `ProductController`/`WarehouseController`.
 */
@Controller('delivery/carriers')
@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)
export class CarrierController {
  private readonly runInTenant: ReturnType<typeof createRunInTenant>;

  constructor(
    private readonly deliveryService: DeliveryService,
    tenantContext: TenantContextService,
  ) {
    this.runInTenant = createRunInTenant(tenantContext);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async create(
    @Body() body: CreateCarrierDto,
    @Req() req: TenantScopedRequest,
  ): Promise<CarrierResponseDto> {
    return this.runInTenant(req.tenant, () => this.deliveryService.createCarrier(body));
  }

  @Get()
  async list(
    @Query('warehouseId') warehouseId: string | undefined,
    @Req() req: TenantScopedRequest,
  ): Promise<CarrierResponseDto[]> {
    return this.runInTenant(req.tenant, () => this.deliveryService.listCarriers({ warehouseId }));
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Req() req: TenantScopedRequest): Promise<CarrierResponseDto> {
    return this.runInTenant(req.tenant, async () => {
      const found = await this.deliveryService.findCarrierById(id);
      if (!found) {
        throw new NotFoundException(`Carrier "${id}" not found`);
      }
      return found;
    });
  }

  @Patch(':id')
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateCarrierDto,
    @Req() req: TenantScopedRequest,
  ): Promise<CarrierResponseDto> {
    return this.runInTenant(req.tenant, () => this.deliveryService.updateCarrier(id, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(USER_ROLES.owner, USER_ROLES.admin)
  async softDelete(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
  ): Promise<{ id: string }> {
    await this.runInTenant(req.tenant, () => this.deliveryService.deactivateCarrier(id));
    return { id };
  }
}
