import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  Roles,
  RolesGuard,
  TenantContextGuard,
  createRunInTenant,
  type SanitizedUser,
} from '@store-mgmt/api-common';
import { TenantContextService, type TenantContext } from '@store-mgmt/infra-db';
import type { Request } from 'express';
import {
  InvalidStockMovementError,
  NegativeStockError,
  RoleHelpers,
  USER_ROLES,
  WAREHOUSE_OPERATOR_REPOSITORY,
  type IWarehouseOperatorRepository,
} from '@store-mgmt/domain';
import { StockService } from './stock.service.js';
import type { MovementResponseDto, RecordMovementDto, StockLevelResponseDto } from './dto/index.js';

/** `Request` carrying the `req.user` populated by `JwtStrategy` and `req.tenant` set by `TenantContextGuard` — never carries `passwordHash`. */
type AuthenticatedRequest = Request & { user: SanitizedUser; tenant: TenantContext };

/** The closed `StockMovementType` union, mirrored here for boundary validation. */
const VALID_MOVEMENT_TYPES = new Set<string>([
  'purchase_in',
  'sale_out',
  'transfer_in',
  'transfer_out',
  'adjustment_in',
  'adjustment_out',
]);

/**
 * REST delivery for the Stock module. `GET /stock` reads a `StockLevel`
 * (derived `available` as a string, all-zero when the pair has no row yet).
 * `POST /stock/movements` runs the atomic onHand-mutation flow. Validates
 * `type` against the closed union at the boundary (mirrors `assertCurrency`
 * in `ProductController`); maps `InvalidStockMovementError`/
 * `NegativeStockError` -> 400. Both routes are `owner`/`admin`/
 * `warehouse_operator`-only; a `warehouse_operator` (unlike an owner/admin,
 * who see every warehouse) is further scoped to their OWN `warehouseId`
 * (backend-users-roles permission matrix / OperadorAlmacen Warehouse Scope
 * requirement) — a mismatched `warehouseId` is rejected with 403.
 */
@Controller('stock')
@UseGuards(JwtAuthGuard, TenantContextGuard, RolesGuard)
@Roles(USER_ROLES.owner, USER_ROLES.admin, USER_ROLES.warehouse_operator)
export class StockController {
  private readonly runInTenant: ReturnType<typeof createRunInTenant>;

  constructor(
    private readonly stockService: StockService,
    @Inject(WAREHOUSE_OPERATOR_REPOSITORY)
    private readonly warehouseOperatorRepository: IWarehouseOperatorRepository,
    tenantContext: TenantContextService,
  ) {
    this.runInTenant = createRunInTenant(tenantContext);
  }

  @Get()
  async getLevel(
    @Query('productId') productId: string,
    @Query('warehouseId') warehouseId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<StockLevelResponseDto> {
    return this.runInTenant(req.tenant, async () => {
      await this.assertWarehouseScope(req.user, warehouseId);
      return this.stockService.getLevel(productId, warehouseId);
    });
  }

  @Post('movements')
  @HttpCode(HttpStatus.CREATED)
  async recordMovement(
    @Body() body: RecordMovementDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MovementResponseDto> {
    if (!VALID_MOVEMENT_TYPES.has(body.type)) {
      throw new BadRequestException(`Unknown movement type: "${body.type}"`);
    }
    return this.runInTenant(req.tenant, async () => {
      await this.assertWarehouseScope(req.user, body.warehouseId);
      return this.withDomainErrorMapping(() => this.stockService.recordMovement(body));
    });
  }

  /**
   * `owner`/`admin` see every warehouse (no scoping); a plain
   * `warehouse_operator` MUST match their own `OperadorAlmacen.warehouseId`.
   * `RolesGuard` already guaranteed the caller holds one of the three roles,
   * so reaching the `findByUserId` branch below implies NOT owner/admin.
   */
  private async assertWarehouseScope(user: SanitizedUser, warehouseId: string): Promise<void> {
    if (
      RoleHelpers.hasRole(user.roles, USER_ROLES.owner) ||
      RoleHelpers.hasRole(user.roles, USER_ROLES.admin)
    ) {
      return;
    }
    const operator = await this.warehouseOperatorRepository.findByUserId(user.id);
    if (!operator || operator.warehouseId !== warehouseId) {
      throw new ForbiddenException('Not scoped to this warehouse');
    }
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidStockMovementError || err instanceof NegativeStockError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
