import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CHANNEL_CURRENCY,
  InsufficientStockError,
  InvalidOrderError,
  InvalidOrderStateError,
  NegativeStockError,
  RateNotFoundError,
} from '@store-mgmt/domain';
import { VentasService } from './ventas.service.js';
import type {
  CreateOrderDto,
  MoneyAmountDto,
  OrderResponseDto,
  UpdateOrderDto,
} from './dto/index.js';

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
 * REST delivery for the Ventas module (Order aggregate). Validates every
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
 * endpoints (`VentasService.confirm/deliver/cancel/update` pre-check
 * existence and resolve to `null`, mapped here the same way `findById`
 * already is). There is NO `DELETE` route: an Order is an immutable
 * transactional event — its lifecycle is the status machine
 * (creado/verificado/entregado/cancelado), never a deletion.
 */
@Controller('orders')
export class VentasController {
  constructor(private readonly ventasService: VentasService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: CreateOrderDto): Promise<OrderResponseDto> {
    for (const line of body.lines ?? []) {
      assertCurrency(line.price);
    }
    for (const payment of body.payments ?? []) {
      assertChannel(payment.channel);
      assertCurrency(payment.amount);
    }
    return this.withDomainErrorMapping(() => this.ventasService.create(body));
  }

  @Get()
  async list(): Promise<OrderResponseDto[]> {
    return this.ventasService.list();
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<OrderResponseDto> {
    const found = await this.ventasService.findById(id);
    if (!found) {
      throw new NotFoundException(`Order "${id}" not found`);
    }
    return found;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateOrderDto,
  ): Promise<OrderResponseDto> {
    return this.withDomainErrorMapping(async () => {
      const updated = await this.ventasService.update(id, body);
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
      const confirmed = await this.ventasService.confirm(id);
      if (!confirmed) {
        throw new NotFoundException(`Order "${id}" not found`);
      }
      return confirmed;
    });
  }

  @Post(':id/deliver')
  @HttpCode(HttpStatus.OK)
  async deliver(@Param('id') id: string): Promise<OrderResponseDto> {
    return this.withDomainErrorMapping(async () => {
      const delivered = await this.ventasService.deliver(id);
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
      const cancelled = await this.ventasService.cancel(id);
      if (!cancelled) {
        throw new NotFoundException(`Order "${id}" not found`);
      }
      return cancelled;
    });
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidOrderError) {
        throw new BadRequestException(err.message);
      }
      if (
        err instanceof InvalidOrderStateError ||
        err instanceof RateNotFoundError ||
        err instanceof InsufficientStockError ||
        err instanceof NegativeStockError
      ) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
