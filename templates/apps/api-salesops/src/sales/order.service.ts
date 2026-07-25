import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateOrderInput,
  Currency,
  DeliveryMode,
  ExchangeRate as DomainExchangeRate,
  ICurrencyRepository,
  IOrderRepository,
  Order as DomainOrder,
  OrderLine as DomainOrderLine,
  OrderListFilter,
  OrderPayment as DomainOrderPayment,
  PaymentChannel,
  SaleCredit as DomainSaleCredit,
} from '@store-mgmt/domain';
import {
  CHANNEL_CURRENCY,
  CURRENCY_REPOSITORY,
  InvalidOrderStateError,
  ORDER_REPOSITORY,
  createOrder,
  discountPriceFromDecimalString,
  discountPriceToDecimalString,
  moneyFromDecimalString,
  moneyToDecimalString,
  percentFromDecimalString,
  percentToDecimalString,
  rateToDecimalString,
} from '@store-mgmt/domain';
import type {
  CreateOrderDto,
  OrderLineResponseDto,
  OrderPaymentResponseDto,
  OrderResponseDto,
  SaleCreditResponseDto,
  UpdateOrderDto,
} from './dto/index.js';

/** All five confirmed channels, derived from the domain's fixed map (mirrors `CurrencyService`). */
const ALL_CHANNELS = Object.keys(CHANNEL_CURRENCY) as PaymentChannel[];

/**
 * Orchestration layer for the Sales module (Order aggregate): the only
 * place with both I/O (`ORDER_REPOSITORY`+`CURRENCY_REPOSITORY`) and domain
 * logic (`createOrder`). `create` MUST, in order (design.md decision #3):
 * (1) load rates via `ICurrencyRepository`, (2) run the domain `createOrder`
 * factory to build the WHOLE validated aggregate in memory, THEN (3) pass
 * the built `Order` to `orderRepository.create()` — the repository is a
 * dumb persister, never a second source of invariants. `confirm`/`deliver`/
 * `cancel` delegate the actual status transition straight to the matching
 * repository method and propagate `InvalidOrderStateError`/
 * `InsufficientStockError`/`NegativeStockError`/`RateNotFoundError`
 * unmapped — `OrderController` maps them to HTTP. Each of those three (plus
 * `update`) first checks existence via `findById` and resolves to `null` on
 * a missing id: `IOrderRepository.confirm/deliver/cancel` use Prisma's
 * `findUniqueOrThrow` internally, which throws a raw (non-domain) Prisma
 * error on an unknown id — pre-checking here keeps that infra-layer error
 * from ever reaching the controller, letting it map a clean 404 the same
 * way `findById`/`GET :id` already does.
 */
@Injectable()
export class OrderService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository,
    @Inject(CURRENCY_REPOSITORY) private readonly currencyRepository: ICurrencyRepository,
  ) {}

  async create(input: CreateOrderDto): Promise<OrderResponseDto> {
    const at = new Date();
    const rates = await this.fetchAllRates(at);

    const buildInput: CreateOrderInput = {
      customerId: input.customerId,
      customerName: input.customerName,
      warehouseId: input.warehouseId,
      deliveryMode: input.deliveryMode as DeliveryMode,
      lines: input.lines.map((line) => ({
        productId: line.productId,
        productName: line.productName,
        categoryName: line.categoryName,
        price: moneyFromDecimalString(line.price.amount, line.price.currency as Currency),
        percentDiscountPrice:
          line.percentDiscountPrice !== undefined
            ? percentFromDecimalString(line.percentDiscountPrice)
            : undefined,
        discountPrice:
          line.discountPrice !== undefined
            ? discountPriceFromDecimalString(line.discountPrice)
            : undefined,
        quantity: line.quantity,
      })),
      payments: (input.payments ?? []).map((payment) => ({
        channel: payment.channel as PaymentChannel,
        amount: moneyFromDecimalString(payment.amount.amount, payment.amount.currency as Currency),
      })),
    };

    // (2) build the WHOLE aggregate in memory first, (3) only then persist —
    // never the other way around (design.md decision #1/#3).
    const order = createOrder(buildInput, rates, at);
    const created = await this.orderRepository.create(order);
    return this.toResponse(created);
  }

  async update(id: string, patch: UpdateOrderDto): Promise<OrderResponseDto | null> {
    const existing = await this.orderRepository.findById(id);
    if (!existing) return null;
    if (existing.status !== 'creado') {
      throw new InvalidOrderStateError(id, 'creado', existing.status);
    }

    const updated = await this.orderRepository.update(id, {
      ...(patch.customerName !== undefined ? { customerName: patch.customerName } : {}),
      ...(patch.warehouseId !== undefined ? { warehouseId: patch.warehouseId } : {}),
      ...(patch.deliveryMode !== undefined
        ? { deliveryMode: patch.deliveryMode as DeliveryMode }
        : {}),
    });
    return this.toResponse(updated);
  }

  async findById(id: string): Promise<OrderResponseDto | null> {
    const found = await this.orderRepository.findById(id);
    return found ? this.toResponse(found) : null;
  }

  async list(filter?: OrderListFilter): Promise<OrderResponseDto[]> {
    const rows = await this.orderRepository.list(filter);
    return rows.map((row) => this.toResponse(row));
  }

  async confirm(id: string): Promise<OrderResponseDto | null> {
    const existing = await this.orderRepository.findById(id);
    if (!existing) return null;
    const confirmed = await this.orderRepository.confirm(id);
    return this.toResponse(confirmed);
  }

  async deliver(id: string): Promise<OrderResponseDto | null> {
    const existing = await this.orderRepository.findById(id);
    if (!existing) return null;
    const delivered = await this.orderRepository.deliver(id);
    return this.toResponse(delivered);
  }

  async cancel(id: string): Promise<OrderResponseDto | null> {
    const existing = await this.orderRepository.findById(id);
    if (!existing) return null;
    const cancelled = await this.orderRepository.cancel(id);
    return this.toResponse(cancelled);
  }

  /**
   * `createOrder`/`buildOrderLine`/`buildOrderPayment` need cross-channel
   * rate history to resolve the currency-fallback cascade, but the port
   * only exposes `ratesForChannel` for a single channel at a time — same
   * discipline as `CurrencyService.fetchAllRates`.
   */
  private async fetchAllRates(at: Date): Promise<DomainExchangeRate[]> {
    const perChannel = await Promise.all(
      ALL_CHANNELS.map((channel) => this.currencyRepository.ratesForChannel(channel, at)),
    );
    return perChannel.flat();
  }

  private toResponse(order: DomainOrder): OrderResponseDto {
    return {
      id: order.id,
      customerId: order.customerId,
      customerName: order.customerName,
      warehouseId: order.warehouseId,
      deliveryMode: order.deliveryMode,
      currency: order.currency,
      status: order.status,
      subtotal: moneyToDecimalString(order.subtotal),
      discountTotal: moneyToDecimalString(order.discountTotal),
      total: moneyToDecimalString(order.total),
      lines: order.lines.map((line) => this.toLineResponse(line)),
      payments: order.payments.map((payment) => this.toPaymentResponse(payment)),
      saleCredit: order.saleCredit ? this.toSaleCreditResponse(order.saleCredit) : null,
      orderDate: order.orderDate.toISOString(),
      verifiedAt: order.verifiedAt ? order.verifiedAt.toISOString() : null,
      deliveredAt: order.deliveredAt ? order.deliveredAt.toISOString() : null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private toLineResponse(line: DomainOrderLine): OrderLineResponseDto {
    return {
      id: line.id,
      productId: line.productId,
      productName: line.productName,
      categoryName: line.categoryName,
      price: { amount: moneyToDecimalString(line.price), currency: line.price.currency },
      percentDiscountPrice: percentToDecimalString(line.percentDiscountPrice),
      discountPrice: discountPriceToDecimalString(line.discountPrice),
      quantity: line.quantity,
      unitFinalPrice: {
        amount: moneyToDecimalString(line.unitFinalPrice),
        currency: line.unitFinalPrice.currency,
      },
      lineTotalNative: {
        amount: moneyToDecimalString(line.lineTotalNative),
        currency: line.lineTotalNative.currency,
      },
      rateApplied: rateToDecimalString(line.rateApplied.rate),
      rateEffectiveFrom: line.rateEffectiveFrom.toISOString(),
      lineTotalOrder: moneyToDecimalString(line.lineTotalOrder),
    };
  }

  private toPaymentResponse(payment: DomainOrderPayment): OrderPaymentResponseDto {
    return {
      id: payment.id,
      channel: payment.channel,
      amount: { amount: moneyToDecimalString(payment.amount), currency: payment.amount.currency },
      rateApplied: rateToDecimalString(payment.rateApplied.rate),
      rateEffectiveFrom: payment.rateEffectiveFrom.toISOString(),
      amountInOrderCurrency: moneyToDecimalString(payment.amountInOrderCurrency),
    };
  }

  private toSaleCreditResponse(saleCredit: DomainSaleCredit): SaleCreditResponseDto {
    return {
      id: saleCredit.id,
      orderId: saleCredit.orderId,
      customerId: saleCredit.customerId,
      total: moneyToDecimalString(saleCredit.total),
      paid: moneyToDecimalString(saleCredit.paid),
      rateApplied: rateToDecimalString(saleCredit.rateApplied.rate),
      rateEffectiveFrom: saleCredit.rateEffectiveFrom.toISOString(),
      createdAt: saleCredit.createdAt.toISOString(),
      updatedAt: saleCredit.updatedAt.toISOString(),
    };
  }
}
