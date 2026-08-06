import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, RolesGuard, TenantContextGuard, createRunInTenant } from '@store-mgmt/api-common';
import type { DeliveryAssignmentStatus } from '@store-mgmt/domain';
import { TenantContextService, type TenantContext } from '@store-mgmt/infra-db';
import type { Request } from 'express';
import { DeliveryService } from './delivery.service.js';
import type { CarrierCapacityResponseDto, DeliveryAssignmentResponseDto } from './dto/index.js';

/** `Request` carrying `req.tenant`, set by `TenantContextGuard` (design D4/D5). */
type TenantScopedRequest = Request & { tenant: TenantContext };

function parseDate(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/**
 * REST delivery for `DeliveryAssignment` reads + the capacity snapshot —
 * READS ONLY this phase (Phase 6 adds `POST /delivery/assignments` and
 * `POST /delivery/assignments/:id/deliver`, `owner`/`admin`/
 * `warehouse_operator`-only). No `@Roles` on any handler here — every read
 * is open to any authenticated tenant user (design §6, spec: reads carry no
 * role restriction).
 *
 * `by-order/:orderId` MUST tolerate a missing assignment — `null` is the
 * modelled meaning of "pickup, or delivered before this module existed",
 * never a 404 (design §6).
 */
@Controller('delivery')
@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)
export class DeliveryAssignmentController {
  private readonly runInTenant: ReturnType<typeof createRunInTenant>;

  constructor(
    private readonly deliveryService: DeliveryService,
    tenantContext: TenantContextService,
  ) {
    this.runInTenant = createRunInTenant(tenantContext);
  }

  @Get('assignments')
  async list(
    @Query('status') status: DeliveryAssignmentStatus | undefined,
    @Query('carrierId') carrierId: string | undefined,
    @Req() req: TenantScopedRequest,
  ): Promise<DeliveryAssignmentResponseDto[]> {
    return this.runInTenant(req.tenant, () => this.deliveryService.listAssignments({ status, carrierId }));
  }

  @Get('assignments/by-order/:orderId')
  async findByOrderId(
    @Param('orderId') orderId: string,
    @Req() req: TenantScopedRequest,
  ): Promise<DeliveryAssignmentResponseDto | null> {
    return this.runInTenant(req.tenant, () => this.deliveryService.findAssignmentByOrderId(orderId));
  }

  @Get('capacity')
  async capacity(
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() req: TenantScopedRequest,
  ): Promise<CarrierCapacityResponseDto> {
    return this.runInTenant(req.tenant, () =>
      this.deliveryService.getCarrierCapacity({ from: parseDate(from), to: parseDate(to) }),
    );
  }
}
