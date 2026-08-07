import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard, TenantContextGuard, createRunInTenant } from '@store-mgmt/api-common';
import {
  CarrierNotFoundError,
  InvalidAssignmentStateError,
  OrderAlreadyAssignedError,
  USER_ROLES,
  type DeliveryAssignmentStatus,
} from '@store-mgmt/domain';
import { TenantContextService, type TenantContext } from '@store-mgmt/infra-db';
import type { Request } from 'express';
import { DeliveryService } from './delivery.service.js';
import type {
  AssignCarrierDto,
  CarrierCapacityResponseDto,
  DeliveryAssignmentResponseDto,
} from './dto/index.js';

/** `Request` carrying `req.tenant`, set by `TenantContextGuard` (design D4/D5). */
type TenantScopedRequest = Request & { tenant: TenantContext };

function parseDate(value: string | undefined): Date | undefined {
  return value === undefined ? undefined : new Date(value);
}

/**
 * REST delivery for `DeliveryAssignment` reads, the capacity snapshot,
 * `POST /delivery/assignments` (task 6.3/6.4), and
 * `POST /delivery/assignments/:id/deliver` (task 6.5/6.6, Phase 6b — the
 * `IOrderDeliveryGateway`/`SalesModule` door). Reads carry no `@Roles` — open
 * to any authenticated tenant user (design §6, spec: reads carry no role
 * restriction). `assign`/`markDelivered` require `owner`/`admin`/
 * `warehouse_operator` — mirrors `POST /orders/:id/deliver`'s roles exactly
 * (spec: "Assigning a carrier and marking an assignment delivered are
 * OPERATIONS, not master-data writes").
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

  @Post('assignments')
  @HttpCode(HttpStatus.CREATED)
  @Roles(USER_ROLES.owner, USER_ROLES.admin, USER_ROLES.warehouse_operator)
  async assign(
    @Body() body: AssignCarrierDto,
    @Req() req: TenantScopedRequest,
  ): Promise<DeliveryAssignmentResponseDto> {
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(() => this.deliveryService.assign(body)),
    );
  }

  /**
   * `IDeliveryAssignmentRepository` never learns a `markDelivered` write —
   * `DeliveryService.markDelivered` re-reads after delegating to
   * `IOrderDeliveryGateway`, so `null` (unknown id) is the only "not found"
   * outcome to map here; `InvalidAssignmentStateError` covers the
   * not-`in_transit` guard.
   */
  @Post('assignments/:id/deliver')
  @HttpCode(HttpStatus.OK)
  @Roles(USER_ROLES.owner, USER_ROLES.admin, USER_ROLES.warehouse_operator)
  async markDelivered(
    @Param('id') id: string,
    @Req() req: TenantScopedRequest,
  ): Promise<DeliveryAssignmentResponseDto> {
    return this.runInTenant(req.tenant, () =>
      this.withDomainErrorMapping(async () => {
        const result = await this.deliveryService.markDelivered(id);
        if (!result) {
          throw new NotFoundException(`DeliveryAssignment "${id}" not found`);
        }
        return result;
      }),
    );
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

  /**
   * `CarrierNotFoundError` -> 404 (unknown OR inactive carrier — one error,
   * one status, per its own message). `OrderAlreadyAssignedError` -> 409 —
   * the request is well-formed, the order just cannot accept a second
   * assignment right now (mirrors `order.controller.ts`'s 409 class).
   * `InvalidAssignmentStateError` -> 409 — `markDelivered` on an assignment
   * that is not `in_transit` (task 6.5/6.6).
   */
  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof CarrierNotFoundError) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof OrderAlreadyAssignedError) {
        throw new ConflictException(err.message);
      }
      if (err instanceof InvalidAssignmentStateError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
