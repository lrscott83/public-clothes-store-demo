import { Inject, Injectable } from '@nestjs/common';
import type {
  BasketLine,
  CreateOrderInput,
  Currency,
  DeliveryMode,
  ExchangeRate as DomainExchangeRate,
  ICategoryRepository,
  ICurrencyRepository,
  ICustomerRepository,
  IOrderRepository,
  IProductRepository,
  IStockLevelRepository,
  IWarehouseRepository,
  Product as DomainProduct,
  Order as DomainOrder,
  OrderLine as DomainOrderLine,
  OrderListFilter,
  StockLevel,
  OrderPayment as DomainOrderPayment,
  PaymentChannel,
  SaleCredit as DomainSaleCredit,
} from '@store-mgmt/domain';
import {
  CHANNEL_CURRENCY,
  CURRENCY_REPOSITORY,
  InvalidOrderStateError,
  ORDER_REPOSITORY,
  OrderLabelHelpers,
  CATEGORY_REPOSITORY,
  CUSTOMER_REPOSITORY,
  PRODUCT_REPOSITORY,
  STOCK_LEVEL_REPOSITORY,
  UnsellableOrderReferenceError,
  WAREHOUSE_REPOSITORY,
  assertWarehouseCoversBasket,
  createOrder,
  discountPriceToDecimalString,
  moneyFromDecimalString,
  moneyToDecimalString,
  percentToDecimalString,
  rateToDecimalString,
} from '@store-mgmt/domain';
import type {
  CreateOrderDto,
  CreateOrderLineDto,
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
    @Inject(STOCK_LEVEL_REPOSITORY) private readonly stockLevelRepository: IStockLevelRepository,
    @Inject(WAREHOUSE_REPOSITORY) private readonly warehouseRepository: IWarehouseRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(CATEGORY_REPOSITORY) private readonly categoryRepository: ICategoryRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepository: ICustomerRepository,
  ) {}

  /**
   * A warehouse must EXIST and be ACTIVE before it can receive an order.
   * Stock alone is not enough: a soft-deleted warehouse can still hold rows,
   * and the eligibility query lists active warehouses only — without this the
   * write would accept what the read says does not qualify. An unknown id
   * must also fail here rather than as a shortage or, worse, as a raw FK
   * error from the repository.
   */
  private async assertWarehouseSellable(warehouseId: string): Promise<void> {
    const found = await this.warehouseRepository.findById(warehouseId);
    if (!found) {
      throw new UnsellableOrderReferenceError('warehouse', warehouseId, 'not found');
    }
    if (!found.active) {
      throw new UnsellableOrderReferenceError('warehouse', warehouseId, 'inactive');
    }
  }

  /**
   * Resolves the CATALOG data every order line is a snapshot OF. The caller
   * supplies `productId` and `quantity` and nothing else that reaches money:
   * a price accepted from the request would flow into the line total, the
   * order total, the payment sum and the credit balance, which means the
   * caller could name its own price for a real product.
   *
   * "Snapshot" has always meant a copy of something authoritative, frozen at
   * sale time. It never meant "whatever the request said".
   */
  private async resolveLineSnapshots(
    lines: readonly CreateOrderLineDto[],
  ): Promise<CreateOrderInput['lines']> {
    const productIds = [...new Set(lines.map((line) => line.productId))];
    const products = new Map(
      await Promise.all(
        productIds.map(async (id): Promise<[string, DomainProduct]> => {
          const found = await this.productRepository.findById(id);
          if (!found) {
            throw new UnsellableOrderReferenceError('product', id, 'not found');
          }
          if (!found.active) {
            throw new UnsellableOrderReferenceError('product', id, 'inactive');
          }
          return [id, found];
        }),
      ),
    );

    const categoryIds = [...new Set([...products.values()].map((p) => p.categoryId))];
    const categoryNames = new Map(
      await Promise.all(
        categoryIds.map(async (id): Promise<[string, string]> => {
          const found = await this.categoryRepository.findById(id);
          if (!found) {
            throw new UnsellableOrderReferenceError('category', id, 'not found');
          }
          return [id, found.name];
        }),
      ),
    );

    return lines.map((line) => {
      // Non-null: every id was resolved above or the whole call threw.
      const product = products.get(line.productId)!;
      return {
        productId: product.id,
        productName: product.name,
        categoryName: categoryNames.get(product.categoryId)!,
        price: product.price,
        percentDiscountPrice: product.percentDiscountPrice,
        discountPrice: product.discountPrice,
        quantity: line.quantity,
      };
    });
  }

  /** The customer must exist and be active; its name is snapshot from the record, never from the request. */
  private async resolveCustomerName(customerId: string): Promise<string> {
    const found = await this.customerRepository.findById(customerId);
    if (!found) {
      throw new UnsellableOrderReferenceError('customer', customerId, 'not found');
    }
    if (!found.active) {
      throw new UnsellableOrderReferenceError('customer', customerId, 'inactive');
    }

    return found.fullName;
  }

  async create(input: CreateOrderDto): Promise<OrderResponseDto> {
    const at = new Date();
    const rates = await this.fetchAllRates(at);


    // Everything that reaches money is resolved server-side, BEFORE the
    // aggregate is built. The request contributes only what to sell, how many,
    // to whom, from where, and how it is paid.
    const buildInput: CreateOrderInput = {
      customerId: input.customerId,
      customerName: await this.resolveCustomerName(input.customerId),
      warehouseId: input.warehouseId,
      deliveryMode: input.deliveryMode as DeliveryMode,
      lines: await this.resolveLineSnapshots(input.lines),
      payments: (input.payments ?? []).map((payment) => ({
        channel: payment.channel as PaymentChannel,
        amount: moneyFromDecimalString(payment.amount.amount, payment.amount.currency as Currency),
      })),
    };

    // (2) build the WHOLE aggregate in memory first, (3) only then persist —
    // never the other way around (design.md decision #1/#3).
    const order = createOrder(buildInput, rates, at);

    // Availability is checked once the aggregate is built, so the basket
    // measured is exactly what would be persisted.
    //
    // Fast-fail only: nothing is reserved here, so a warehouse reported able
    // can still lose the stock before `confirm`, which reserves for real and
    // rejects on its own. That race is accepted deliberately — the point is
    // to stop an order being written against a warehouse that plainly cannot
    // fill it, not to hold stock at creation.
    await this.assertWarehouseSellable(order.warehouseId);
    const basket = order.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
    }));
    assertWarehouseCoversBasket(order.warehouseId, basket, await this.fetchStockLevels(basket));

    const created = await this.orderRepository.create(order);
    return this.toResponse(created);
  }

  async update(id: string, patch: UpdateOrderDto): Promise<OrderResponseDto | null> {
    const existing = await this.orderRepository.findById(id);
    if (!existing) return null;
    if (existing.status !== 'created') {
      throw new InvalidOrderStateError(id, 'created', existing.status);
    }

    // Re-validate ONLY when the warehouse actually MOVES. A patch that omits
    // `warehouseId`, or restates the current one, must not pay for a stock
    // read — and must not be able to fail on stock that drifted since the
    // order was created.
    if (patch.warehouseId !== undefined && patch.warehouseId !== existing.warehouseId) {
      await this.assertWarehouseSellable(patch.warehouseId);
      const basket = existing.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
      }));
      assertWarehouseCoversBasket(patch.warehouseId, basket, await this.fetchStockLevels(basket));
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

  /**
   * `IStockLevelRepository.list`'s filter is SINGULAR (`productId?`), so a
   * basket needs a fan-out — same shape as `fetchAllRates`. Deduped first:
   * two lines of the same product must not cost two queries.
   */
  private async fetchStockLevels(basket: readonly BasketLine[]): Promise<StockLevel[]> {
    const productIds = [...new Set(basket.map((line) => line.productId))];
    const perProduct = await Promise.all(
      productIds.map((productId) => this.stockLevelRepository.list({ productId })),
    );

    return perProduct.flat();
  }

  private toResponse(order: DomainOrder): OrderResponseDto {
    return {
      id: order.id,
      customerId: order.customerId,
      customerName: order.customerName,
      warehouseId: order.warehouseId,
      deliveryMode: order.deliveryMode,
      deliveryModeLabel: OrderLabelHelpers.getDeliveryModeLabel(order.deliveryMode),
      currency: order.currency,
      status: order.status,
      statusLabel: OrderLabelHelpers.getOrderStatusLabel(order.status),
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
