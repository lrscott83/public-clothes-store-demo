import { Controller, Get, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard, TenantContextGuard, createRunInTenant } from '@store-mgmt/api-common';
import { TenantContextService, type TenantContext } from '@store-mgmt/infra-db';
import type { Request } from 'express';
import { DeliveryService } from './delivery.service.js';
import type { CarrierResponseDto } from './dto/index.js';

/** `Request` carrying `req.tenant`, set by `TenantContextGuard` (design D4/D5). */
type TenantScopedRequest = Request & { tenant: TenantContext };

/**
 * REST delivery for the Carrier catalog — READS ONLY this phase (Phase 6
 * adds `POST`/`PATCH`/soft-`DELETE`, `owner`/`admin`-only). No `@Roles` on
 * either handler here: carrier catalog reads are open to any authenticated
 * tenant user, mirroring `product.controller.ts`/`warehouse.controller.ts`
 * (spec: "Any authenticated tenant user can read carriers").
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
}
