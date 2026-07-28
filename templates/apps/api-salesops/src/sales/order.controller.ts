import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, Roles, RolesGuard, type SanitizedUser } from '@store-mgmt/api-common';
import type { Request } from 'express';
import {
  CHANNEL_CURRENCY,
  InsufficientStockError,
  InvalidOrderError,
  InvalidOrderStateError,
  NegativeStockError,
  RateNotFoundError,
  RoleHelpers,
  USER_ROLES,
  WAREHOUSE_OPERATOR_REPOSITORY,
  WarehouseCannotFulfillOrderError,
  UnsellableOrderReferenceError,
  type IWarehouseOperatorRepository,
} from '@store-mgmt/domain';
import { OrderService } from './order.service.js';
import type {
  CreateOrderDto,
  MoneyAmountDto,
  OrderResponseDto,
  UpdateOrderDto,
} from './dto/index.js';

/** `Request` carrying the `req.user` populated by `JwtStrategy` — never carries `passwordHash`. */
type AuthenticatedRequest = Request & { user: SanitizedUser };

const VALID_CURRENCIES = new Set<string>(['USD', 'EUR', 'MN']);
const VALID_CHANNELS = new Set<string>(Object.keys(CHANNEL_CURRENCY));

/** Validates a `MoneyAmountDto.currency` — mirrors `ProductController.assertCurrency`. */
function assertCurrency(amount: MoneyAmountDto): void {
  if (!VALID_CURRENCIES.has(amount.currency)) {
    throw new BadRequestException(`Unknown currency: "${amount.currency}"`);
  }
}

/** Validates an `OrderPayment.channel` — mirrors `CurrencyController.assertChannel`. */
function assertChannel(channel: string): void {
  if (!VALID_CHANNELS.has(channel)) {
    throw new BadRequestException(`Unknown payment channel: "${channel}"`);
  }
}

/**
 * REST delivery for the Sales module (Order aggregate). Validates every
 * `MoneyAmountDto.currency` and `OrderPayment.channel` at the boundary
 * BEFORE calling the service (mirrors `ProductController`/
 * `CurrencyController` — an unknown enum value would otherwise reach
 * `MONEY_SCALE`/`CHANNEL_CURRENCY` lookups as `undefined` and crash instead
 * of failing cleanly with 400). Maps `InvalidOrderError` -> 400;
 * `InvalidOrderStateError`/`RateNotFoundError`/`InsufficientStockError`
 * (confirm path)/`NegativeStockError` (deliver path) -> 409 — a cross-
 * currency line/payment with no resolvable rate, or a stock-bridge guard
 * failure during a status transition, is a CONFLICT with the order's
 * current state, never a "resource not found" (design.md decision #4/#8).
 * Unknown `id` -> 404 on every id-scoped route, including the three action
 * endpoints (`OrderService.confirm/deliver/cancel/update` pre-check
 * existence and resolve to `null`, mapped here the same way `findById`
 * already is). There is NO `DELETE` route: an Order is an immutable
 * transactional event — its lifecycle is the status machine
 * (created/verified/delivered/cancelled), never a deletion. `create`/
 * `update`/`confirm`/`cancel` are `owner`/`admin`/`sales_operator`-only.
 * `list`/`findById` ALSO admit `warehouse_operator`, scoped to their OWN
 * `warehouseId`. `deliver` is `owner`/`admin`/`warehouse_operator`-only
 * (NOT `sales_operator` — delivery is a warehouse-floor action), likewise
 * scoped to the operator's own warehouse (backend-users-roles permission
 * matrix / OperadorAlmacen Warehouse Scope requirement).
 */
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(USER_ROLES.owner, USER_ROLES.admin, USER_ROLES.sales_operator)
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    @Inject(WAREHOUSE_OPERATOR_REPOSITORY)
    private readonly warehouseOperatorRepository: IWarehouseOperatorRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateOrderDto): Promise<OrderResponseDto> {
    // A line's currency is no longer checkable here — price comes from the
    // catalog, whose currency is already valid. What DOES need checking is the
    // shape, because this app installs no global ValidationPipe and its DTOs
    // are erased at runtime: without this, `quantity: "3"` or a missing
    // `productId` reaches the domain as `undefined`.
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      throw new BadRequestException('lines must be a non-empty array');
    }
    for (const line of body.lines) {
      if (typeof line?.productId !== 'string' || line.productId.trim().length === 0) {
        throw new BadRequestException('each line requires a non-empty productId');
      }
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new BadRequestException(
          `line "${line.productId}" requires a positive integer quantity`,
        );
      }
    }
    for (const payment of body.payments ?? []) {
      assertChannel(payment.channel);
      assertCurrency(payment.amount);
    }
    return this.withDomainErrorMapping(() => this.orderService.create(body));
  }

  @Get()
  @Roles(USER_ROLES.owner, USER_ROLES.admin, USER_ROLES.sales_operator, USER_ROLES.warehouse_operator)
  async list(@Req() req: AuthenticatedRequest): Promise<OrderResponseDto[]> {
    const orders = await this.orderService.list();
    return this.scopeToOperatorWarehouse(req.user, orders);
  }

  @Get(':id')
  @Roles(USER_ROLES.owner, USER_ROLES.admin, USER_ROLES.sales_operator, USER_ROLES.warehouse_operator)
  async findById(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<OrderResponseDto> {
    const found = await this.orderService.findById(id);
    if (!found) {
      throw new NotFoundException(`Order "${id}" not found`);
    }
    await this.assertOrderWarehouseScope(req.user, found.warehouseId);
    return found;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateOrderDto,
  ): Promise<OrderResponseDto> {
    return this.withDomainErrorMapping(async () => {
      const updated = await this.orderService.update(id, body);
      if (!updated) {
        throw new NotFoundException(`Order "${id}" not found`);
      }
      return updated;
    });
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@Param('id') id: string): Promise<OrderResponseDto> {
    return this.withDomainErrorMapping(async () => {
      const confirmed = await this.orderService.confirm(id);
      if (!confirmed) {
        throw new NotFoundException(`Order "${id}" not found`);
      }
      return confirmed;
    });
  }

  @Post(':id/deliver')
  @HttpCode(HttpStatus.OK)
  @Roles(USER_ROLES.owner, USER_ROLES.admin, USER_ROLES.warehouse_operator)
  async deliver(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<OrderResponseDto> {
    return this.withDomainErrorMapping(async () => {
      const existing = await this.orderService.findById(id);
      if (!existing) {
        throw new NotFoundException(`Order "${id}" not found`);
      }
      await this.assertOrderWarehouseScope(req.user, existing.warehouseId);
      const delivered = await this.orderService.deliver(id);
      if (!delivered) {
        throw new NotFoundException(`Order "${id}" not found`);
      }
      return delivered;
    });
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string): Promise<OrderResponseDto> {
    return this.withDomainErrorMapping(async () => {
      const cancelled = await this.orderService.cancel(id);
      if (!cancelled) {
        throw new NotFoundException(`Order "${id}" not found`);
      }
      return cancelled;
    });
  }

  /**
   * `owner`/`admin`/`sales_operator` see every order (no scoping); a plain
   * `warehouse_operator` is scoped to their OWN `warehouseId` — MUST match
   * the order's `warehouseId`, else 403.
   */
  private async assertOrderWarehouseScope(user: SanitizedUser, warehouseId: string): Promise<void> {
    if (!this.isScopedWarehouseOperator(user)) {
      return;
    }
    const operator = await this.warehouseOperatorRepository.findByUserId(user.id);
    if (!operator || operator.warehouseId !== warehouseId) {
      throw new ForbiddenException('Not scoped to this warehouse');
    }
  }

  /** Filters `orders` to the operator's own `warehouseId`; `owner`/`admin`/`sales_operator` see every order unfiltered. */
  private async scopeToOperatorWarehouse(
    user: SanitizedUser,
    orders: OrderResponseDto[],
  ): Promise<OrderResponseDto[]> {
    if (!this.isScopedWarehouseOperator(user)) {
      return orders;
    }
    const operator = await this.warehouseOperatorRepository.findByUserId(user.id);
    if (!operator) {
      return [];
    }
    return orders.filter((order) => order.warehouseId === operator.warehouseId);
  }

  /** `true` only for a caller whose access to this endpoint comes SOLELY from `warehouse_operator` (not owner/admin/sales_operator). */
  private isScopedWarehouseOperator(user: SanitizedUser): boolean {
    return (
      RoleHelpers.hasRole(user.roles, USER_ROLES.warehouse_operator) &&
      !RoleHelpers.hasRole(user.roles, USER_ROLES.owner) &&
      !RoleHelpers.hasRole(user.roles, USER_ROLES.admin) &&
      !RoleHelpers.hasRole(user.roles, USER_ROLES.sales_operator)
    );
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidOrderError) {
        throw new BadRequestException(err.message);
      }
      // 400, not 409: the caller referenced something that is not usable at
      // all — unknown or retired. Nothing about the world changing would make
      // this request succeed. Mirrors `CustomerUserNotFoundError` -> 400.
      if (err instanceof UnsellableOrderReferenceError) {
        throw new BadRequestException(err.message);
      }
      if (
        err instanceof InvalidOrderStateError ||
        err instanceof RateNotFoundError ||
        err instanceof InsufficientStockError ||
        err instanceof NegativeStockError ||
        // 409, not 400: the request is well-formed, the world just cannot
        // satisfy it right now. Same class as `InsufficientStockError`, which
        // is the later, reserving form of the same conflict.
        err instanceof WarehouseCannotFulfillOrderError
      ) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
