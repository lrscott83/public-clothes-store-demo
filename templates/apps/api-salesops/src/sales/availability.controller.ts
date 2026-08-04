import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard, TenantContextGuard, createRunInTenant } from '@store-mgmt/api-common';
import { USER_ROLES, type BasketLine } from '@store-mgmt/domain';
import { TenantContextService, type TenantContext } from '@store-mgmt/infra-db';
import type { Request } from 'express';
import { AvailabilityService } from './availability.service.js';

/** `Request` carrying `req.tenant`, set by `TenantContextGuard` (design D4/D5). */
type TenantScopedRequest = Request & { tenant: TenantContext };

/** One requested product and how many of it. */
interface BasketLineDto {
  readonly productId?: unknown;
  readonly quantity?: unknown;
}

interface AvailabilityQueryDto {
  readonly lines?: unknown;
}

interface EligibleWarehousesResponseDto {
  readonly warehouses: { readonly id: string; readonly name: string }[];
}

/**
 * Validates the basket at the boundary. `api-salesops` installs NO global
 * `ValidationPipe` and its DTOs are undecorated plain classes, so nothing
 * validates a request body unless a controller does it explicitly — the same
 * reason `ProductController` hand-checks `currency` and `StockController`
 * hand-checks `type`.
 */
function assertBasket(lines: unknown): BasketLine[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new BadRequestException('lines must be a non-empty array');
  }

  return lines.map((line: BasketLineDto) => {
    if (typeof line?.productId !== 'string' || line.productId.trim().length === 0) {
      throw new BadRequestException('each line requires a non-empty productId');
    }
    if (!Number.isInteger(line.quantity) || (line.quantity as number) <= 0) {
      throw new BadRequestException(
        `line "${line.productId}" requires a positive integer quantity`,
      );
    }

    return { productId: line.productId, quantity: line.quantity as number };
  });
}

/**
 * Availability read for order creation: given a basket, which warehouses can
 * cover ALL of it? The sales agent picks from this list (D3).
 *
 * Its own `@Controller('orders/availability')` rather than a route on
 * `OrderController`, deliberately: `OrderController` carries a different role
 * set and a `warehouse_operator` scope check that must NOT apply here — the
 * agent is bound to no warehouse (D2).
 *
 * POST, not GET, because a basket is a structured body — mirroring how the
 * order-creation payload is already shaped. It reads only; nothing is
 * reserved or held. A warehouse reported eligible can still fail at
 * `confirm`, and that race is accepted deliberately.
 */
@Controller('orders/availability')
@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)
@Roles(USER_ROLES.owner, USER_ROLES.admin, USER_ROLES.sales_operator, USER_ROLES.sales_agent)
export class AvailabilityController {
  private readonly runInTenant: ReturnType<typeof createRunInTenant>;

  constructor(
    private readonly availabilityService: AvailabilityService,
    tenantContext: TenantContextService,
  ) {
    this.runInTenant = createRunInTenant(tenantContext);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async eligible(
    @Body() body: AvailabilityQueryDto,
    @Req() req: TenantScopedRequest,
  ): Promise<EligibleWarehousesResponseDto> {
    const basket = assertBasket(body?.lines);
    const warehouses = await this.runInTenant(req.tenant, () =>
      this.availabilityService.eligibleWarehousesFor(basket),
    );

    // An empty list is a valid answer, not an error: "nothing can fulfil this
    // basket right now" is exactly what the agent needs to be told.
    return { warehouses: warehouses.map((w) => ({ id: w.id, name: w.name })) };
  }
}
