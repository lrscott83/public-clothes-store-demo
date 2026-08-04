import { Test, TestingModule } from '@nestjs/testing';
import type {
  ICurrencyRepository,
  IOrderRepository,
  ICategoryRepository,
  ICommissionAccrualRecorder,
  ICustomerRepository,
  IProductRepository,
  IStockLevelRepository,
  IWarehouseRepository,
  Customer,
  Money,
  Order as DomainOrder,
  Product,
  StockLevel,
  Warehouse,
} from '@store-mgmt/domain';
import {
  CURRENCY_REPOSITORY,
  InsufficientStockError,
  InvalidOrderError,
  InvalidOrderStateError,
  NegativeStockError,
  ORDER_REPOSITORY,
  RateNotFoundError,
  CATEGORY_REPOSITORY,
  COMMISSION_ACCRUAL_RECORDER,
  CUSTOMER_REPOSITORY,
  PRODUCT_REPOSITORY,
  STOCK_LEVEL_REPOSITORY,
  UnsellableOrderReferenceError,
  WAREHOUSE_REPOSITORY,
  WarehouseCannotFulfillOrderError,
} from '@store-mgmt/domain';
import { OrderService } from './order.service.js';
import type { CreateOrderDto } from './dto/index.js';

function buildOrderRepoMock(): jest.Mocked<IOrderRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
    confirm: jest.fn(),
    deliver: jest.fn(),
    cancel: jest.fn(),
  };
}

function buildCurrencyRepoMock(): jest.Mocked<ICurrencyRepository> {
  return {
    appendRate: jest.fn(),
    ratesForChannel: jest.fn().mockResolvedValue([]),
    latestRate: jest.fn(),
  };
}

function stockLevel(warehouseId: string, productId: string, onHand: number, reserved = 0): StockLevel {
  return {
    id: `sl-${warehouseId}-${productId}`,
    productId,
    warehouseId,
    onHand,
    reserved,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

/**
 * Defaults to AMPLE stock for the sample basket, so the availability
 * invariant is satisfied everywhere it is not the thing under test. Cases
 * that exercise the invariant override `list` explicitly.
 */
function buildStockLevelRepoMock(): jest.Mocked<IStockLevelRepository> {
  return {
    findById: jest.fn(),
    findByProductAndWarehouse: jest.fn(),
    list: jest.fn().mockResolvedValue([stockLevel('warehouse-uuid-1', 'product-uuid-1', 999)]),
    reserve: jest.fn(),
    release: jest.fn(),
  } as unknown as jest.Mocked<IStockLevelRepository>;
}

function warehouse(id: string, active = true): Warehouse {
  return {
    id,
    name: `Depósito ${id}`,
    active,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  } as Warehouse;
}

/** Defaults to a real, ACTIVE warehouse — the uninteresting case everywhere it is not under test. */
function buildWarehouseRepoMock(): jest.Mocked<IWarehouseRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    findById: jest.fn().mockImplementation(async (id: string) => warehouse(id)),
    list: jest.fn().mockResolvedValue([]),
    softDelete: jest.fn(),
  } as unknown as jest.Mocked<IWarehouseRepository>;
}

function product(id: string, price: Money, active = true): Product {
  return {
    id,
    name: 'Producto Catálogo',
    description: '',
    price,
    percentDiscountPrice: 0n,
    discountPrice: 0n,
    cost: { minorUnits: 0n, currency: price.currency },
    categoryId: 'category-uuid-1',
    image: '',
    isNew: false,
    order: 1,
    active,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  } as Product;
}

function buildProductRepoMock(): jest.Mocked<IProductRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    findById: jest
      .fn()
      .mockImplementation(async (id: string) => product(id, { minorUnits: 10000n, currency: 'USD' })),
    list: jest.fn().mockResolvedValue([]),
    softDelete: jest.fn(),
  } as unknown as jest.Mocked<IProductRepository>;
}

function buildCategoryRepoMock(): jest.Mocked<ICategoryRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    findById: jest.fn().mockImplementation(async (id: string) => ({
      id,
      name: 'Categoría Catálogo',
      slug: 'categoria-catalogo',
      order: 1,
      active: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
    list: jest.fn().mockResolvedValue([]),
    softDelete: jest.fn(),
  } as unknown as jest.Mocked<ICategoryRepository>;
}

function customer(id: string, active = true): Customer {
  return {
    id,
    companyUserId: 'user-uuid-1',
    fullName: 'Ana Torres',
    documentId: null,
    cellPhone: null,
    email: null,
    address: null,
    note: null,
    active,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  } as Customer;
}

function buildCustomerRepoMock(): jest.Mocked<ICustomerRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    findById: jest.fn().mockImplementation(async (id: string) => customer(id)),
    list: jest.fn().mockResolvedValue([]),
    softDelete: jest.fn(),
  } as unknown as jest.Mocked<ICustomerRepository>;
}

const at = new Date('2026-01-01T00:00:00.000Z');

function sampleOrder(overrides: Partial<DomainOrder> = {}): DomainOrder {
  return {
    id: 'order-uuid-1',
    customerId: 'customer-uuid-1',
    customerName: 'Ana Torres',
    warehouseId: 'warehouse-uuid-1',
    deliveryMode: 'pickup',
    currency: 'USD',
    status: 'created',
    subtotal: { minorUnits: 10000n, currency: 'USD' },
    discountTotal: { minorUnits: 0n, currency: 'USD' },
    total: { minorUnits: 10000n, currency: 'USD' },
    lines: [
      {
        id: 'line-uuid-1',
        productId: 'product-uuid-1',
        productName: 'Cafetera Express',
        categoryName: 'Cafeteras',
        price: { minorUnits: 10000n, currency: 'USD' },
        percentDiscountPrice: 0n,
        discountPrice: 0n,
        quantity: 1,
        unitFinalPrice: { minorUnits: 10000n, currency: 'USD' },
        lineTotalNative: { minorUnits: 10000n, currency: 'USD' },
        rateApplied: { channel: 'USD_CASH', rate: 1000000n, effectiveFrom: at },
        rateEffectiveFrom: at,
        lineTotalOrder: { minorUnits: 10000n, currency: 'USD' },
      },
    ],
    payments: [
      {
        id: 'payment-uuid-1',
        channel: 'USD_CASH',
        amount: { minorUnits: 10000n, currency: 'USD' },
        rateApplied: { channel: 'USD_CASH', rate: 1000000n, effectiveFrom: at },
        rateEffectiveFrom: at,
        amountInOrderCurrency: { minorUnits: 10000n, currency: 'USD' },
      },
    ],
    saleCredit: null,
    attributedCompanyUserId: ACTOR_COMPANY_USER_ID,
    orderDate: at,
    verifiedAt: null,
    deliveredAt: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

// WHAT and HOW MANY only. Everything that reaches money — name, category,
// price, discounts, customer name — is resolved from the catalog and the
// customer record by the service.
/** The authenticated actor's `CompanyUser.id`, as `OrderController` would pass it. */
const ACTOR_COMPANY_USER_ID = 'cu-actor-1';

const sampleCreateDto: CreateOrderDto = {
  customerId: 'customer-uuid-1',
  warehouseId: 'warehouse-uuid-1',
  deliveryMode: 'pickup',
  lines: [{ productId: 'product-uuid-1', quantity: 1 }],
  payments: [{ channel: 'USD_CASH', amount: { amount: '100.00', currency: 'USD' } }],
};

describe('OrderService', () => {
  let service: OrderService;
  let orderRepo: jest.Mocked<IOrderRepository>;
  let currencyRepo: jest.Mocked<ICurrencyRepository>;
  let stockRepo: jest.Mocked<IStockLevelRepository>;
  let warehouseRepo: jest.Mocked<IWarehouseRepository>;
  let productRepo: jest.Mocked<IProductRepository>;
  let categoryRepo: jest.Mocked<ICategoryRepository>;
  let customerRepo: jest.Mocked<ICustomerRepository>;
  let commissionRecorder: jest.Mocked<ICommissionAccrualRecorder>;

  beforeEach(async () => {
    orderRepo = buildOrderRepoMock();
    currencyRepo = buildCurrencyRepoMock();
    stockRepo = buildStockLevelRepoMock();
    warehouseRepo = buildWarehouseRepoMock();
    productRepo = buildProductRepoMock();
    categoryRepo = buildCategoryRepoMock();
    customerRepo = buildCustomerRepoMock();
    commissionRecorder = {
      recordForDeliveredOrder: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<ICommissionAccrualRecorder>;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: ORDER_REPOSITORY, useValue: orderRepo },
        { provide: CURRENCY_REPOSITORY, useValue: currencyRepo },
        { provide: STOCK_LEVEL_REPOSITORY, useValue: stockRepo },
        { provide: WAREHOUSE_REPOSITORY, useValue: warehouseRepo },
        { provide: PRODUCT_REPOSITORY, useValue: productRepo },
        { provide: CATEGORY_REPOSITORY, useValue: categoryRepo },
        { provide: CUSTOMER_REPOSITORY, useValue: customerRepo },
        // `deliver()` now records a commission accrual through this port. Mocked
        // rather than exercised: what the accrual CONTAINS is the recorder's own
        // spec; what matters here is that delivery still behaves the same.
        { provide: COMMISSION_ACCRUAL_RECORDER, useValue: commissionRecorder },
      ],
    }).compile();
    service = module.get(OrderService);
  });

  describe('create', () => {
    it('loads rates, runs createOrder to build the aggregate, THEN persists it via the repository', async () => {
      orderRepo.create.mockResolvedValue(sampleOrder());

      const result = await service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID);

      expect(currencyRepo.ratesForChannel).toHaveBeenCalled();
      expect(orderRepo.create).toHaveBeenCalledTimes(1);
      const passedOrder = orderRepo.create.mock.calls[0]?.[0] as DomainOrder;
      // The repository is a dumb persister — it must receive an
      // already-built aggregate (status='created', currency derived, totals
      // computed), not the raw DTO.
      expect(passedOrder.status).toBe('created');
      expect(passedOrder.currency).toBe('USD');
      expect(passedOrder.total.minorUnits).toBe(10000n);
      expect(result.id).toBe('order-uuid-1');
      expect(result.total).toBe('100.00');
    });

    it('propagates RateNotFoundError from the domain factory WITHOUT calling the repository', async () => {
      currencyRepo.ratesForChannel.mockResolvedValue([]);
      // The DTO's price is ignored at runtime — `resolveLineSnapshots` resolves
      // the real price from the catalog — so the cross-currency condition has
      // to come from the mocked PRODUCT, not from anything the caller sends.
      // The payment is deliberately USD (not EUR): `resolveRateForCurrency`
      // (rate-resolver.ts:43-51) returns the synthetic USD identity rate
      // unconditionally, so a USD payment can NEVER throw `RateNotFoundError`
      // regardless of what rates are on file — that source of the throw is
      // structurally eliminated, not just avoided by convention. Combined
      // with `createOrder` building every line (order.ts:132) before any
      // payment (order.ts:133-135) — so a throw inside `buildOrderLine` never
      // even reaches payment construction — the EUR-priced line is now the
      // ONLY possible origin of `RateNotFoundError` in this test: delete the
      // override below and nothing throws at all (proven empirically).
      productRepo.findById.mockResolvedValueOnce(
        product('product-uuid-2', { minorUnits: 5000n, currency: 'EUR' }),
      );
      const crossCurrencyDto: CreateOrderDto = {
        ...sampleCreateDto,
        lines: [{ productId: 'product-uuid-2', quantity: 1 }],
        payments: [{ channel: 'USD_CASH', amount: { amount: '50.00', currency: 'USD' } }],
      };

      let caught: unknown;
      try {
        await service.create(crossCurrencyDto, ACTOR_COMPANY_USER_ID);
      } catch (err) {
        caught = err;
      }

      // Observe the actual error rather than just that the call rejected: the
      // EUR-priced line (no USD line present) derives an order currency of
      // 'MN', and converting that EUR line into 'MN' with no rates on file is
      // what must throw — not some unrelated resolution.
      expect(caught).toBeInstanceOf(RateNotFoundError);
      expect((caught as Error).message).toContain('EUR');
      expect(orderRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('confirm/deliver/cancel', () => {
    it('confirm delegates straight to the repository and maps the response', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder());
      orderRepo.confirm.mockResolvedValue(sampleOrder({ status: 'verified', verifiedAt: at }));

      const result = await service.confirm('order-uuid-1');

      expect(orderRepo.confirm).toHaveBeenCalledWith('order-uuid-1');
      expect(result?.status).toBe('verified');
    });

    it('confirm propagates InsufficientStockError unmapped', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder());
      orderRepo.confirm.mockRejectedValue(new InsufficientStockError('not enough stock'));

      await expect(service.confirm('order-uuid-1')).rejects.toThrow(InsufficientStockError);
    });

    it('confirm returns null when the order does not exist (repo.confirm never called)', async () => {
      orderRepo.findById.mockResolvedValue(null);

      const result = await service.confirm('unknown-id');

      expect(result).toBeNull();
      expect(orderRepo.confirm).not.toHaveBeenCalled();
    });

    it('deliver delegates straight to the repository and propagates NegativeStockError unmapped', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder({ status: 'verified' }));
      orderRepo.deliver.mockRejectedValue(new NegativeStockError('onHand would go negative'));

      await expect(service.deliver('order-uuid-1')).rejects.toThrow(NegativeStockError);
      expect(orderRepo.deliver).toHaveBeenCalledWith('order-uuid-1');
    });

    it('deliver records a commission accrual for the DELIVERED order', async () => {
      const delivered = sampleOrder({ status: 'delivered' });
      orderRepo.findById.mockResolvedValue(sampleOrder({ status: 'verified' }));
      orderRepo.deliver.mockResolvedValue(delivered);

      const result = await service.deliver('order-uuid-1');

      // The order handed to the recorder is the DELIVERED one, not the
      // pre-delivery read — accruing from a stale snapshot would credit the
      // agent against a status that had not happened yet.
      expect(commissionRecorder.recordForDeliveredOrder).toHaveBeenCalledWith(delivered);
      // Unchanged behaviour: the delivered order is still returned to the caller.
      expect(result?.status).toBe('delivered');
    });

    it('deliver still returns the delivered order, and logs loudly, when the accrual recorder throws', async () => {
      // Delivery is an operational fact that already committed; a transient
      // failure in the SEPARATE accrual step (design.md A9) must not make the
      // caller believe delivery itself failed — `deliver` is terminal, so a
      // retry of THIS request would read as "already delivered" (409), not
      // as a path back to the missed accrual.
      const delivered = sampleOrder({ status: 'delivered' });
      orderRepo.findById.mockResolvedValue(sampleOrder({ status: 'verified' }));
      orderRepo.deliver.mockResolvedValue(delivered);
      commissionRecorder.recordForDeliveredOrder.mockRejectedValue(
        new Error('reference provider unavailable'),
      );
      const errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

      const result = await service.deliver('order-uuid-1');

      expect(result?.status).toBe('delivered');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [message] = errorSpy.mock.calls[0] as [string];
      expect(message).toContain('order-uuid-1');
      // The attributed agent goes in the log line itself — an on-call
      // engineer paged off this has no in-app lever to pull (design.md §9's
      // reconcile endpoint was never built), so the message must carry
      // everything a manual DB reconciliation needs without a follow-up query.
      expect(message).toContain(delivered.attributedCompanyUserId);
      // No promise of an in-app replay path that does not exist — recovery
      // here is manual DB reconciliation, and the message must say so plainly.
      expect(message).not.toContain('replayed by hand');
      expect(message.toLowerCase()).toContain('manual');
      errorSpy.mockRestore();
    });

    it('stringifies a null attributedCompanyUserId as "null" in the log line, whatever the throw reason', async () => {
      const delivered = sampleOrder({ status: 'delivered', attributedCompanyUserId: null });
      orderRepo.findById.mockResolvedValue(sampleOrder({ status: 'verified' }));
      orderRepo.deliver.mockResolvedValue(delivered);
      commissionRecorder.recordForDeliveredOrder.mockRejectedValue(
        new Error('reference provider unavailable'),
      );
      const errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);

      await service.deliver('order-uuid-1');

      const [message] = errorSpy.mock.calls[0] as [string];
      expect(message).toContain('order-uuid-1');
      expect(message).toContain('null');
      errorSpy.mockRestore();
    });

    it.each(['confirm', 'cancel'] as const)(
      '%s never records an accrual — commission is earned by delivery alone',
      async (action) => {
        orderRepo.findById.mockResolvedValue(sampleOrder());
        orderRepo[action].mockResolvedValue(sampleOrder({ status: 'verified' }));

        await service[action]('order-uuid-1');

        expect(commissionRecorder.recordForDeliveredOrder).not.toHaveBeenCalled();
      },
    );

    it('cancel delegates straight to the repository and propagates InvalidOrderStateError unmapped', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder({ status: 'delivered' }));
      orderRepo.cancel.mockRejectedValue(
        new InvalidOrderStateError('order-uuid-1', 'created|verified', 'delivered'),
      );

      await expect(service.cancel('order-uuid-1')).rejects.toThrow(InvalidOrderStateError);
    });
  });

  describe('create — the line snapshot comes from the CATALOG, never from the caller', () => {
    it('prices the line from the product, ignoring anything price-like the caller sent', async () => {
      // The caller controls only WHAT and HOW MANY. A price accepted from the
      // request would flow straight into the total, the payments and the
      // credit balance — the caller could name its own price.
      productRepo.findById.mockResolvedValue(
        product('product-uuid-1', { minorUnits: 10000n, currency: 'USD' }),
      );
      orderRepo.create.mockResolvedValue(sampleOrder());

      await service.create({
        ...sampleCreateDto,
        lines: [
          {
            productId: 'product-uuid-1',
            quantity: 1,
            // A caller that smuggles these in must not be believed.
            price: { amount: '0.01', currency: 'USD' },
            productName: 'Nombre inventado',
            categoryName: 'Categoría inventada',
          } as never,
        ],
      }, ACTOR_COMPANY_USER_ID);

      const persisted = orderRepo.create.mock.calls[0]?.[0] as DomainOrder;
      expect(persisted.lines[0]?.price.minorUnits).toBe(10000n);
      expect(persisted.lines[0]?.productName).toBe('Producto Catálogo');
      expect(persisted.lines[0]?.categoryName).toBe('Categoría Catálogo');
    });

    it('rejects a product that does not exist', async () => {
      productRepo.findById.mockResolvedValue(null);

      await expect(service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID)).rejects.toThrow(UnsellableOrderReferenceError);
      expect(orderRepo.create).not.toHaveBeenCalled();
    });

    it('rejects a soft-deleted product', async () => {
      productRepo.findById.mockResolvedValue(
        product('product-uuid-1', { minorUnits: 10000n, currency: 'USD' }, false),
      );

      await expect(service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID)).rejects.toThrow(/inactive/i);
      expect(orderRepo.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown customer, and takes customerName from the customer record', async () => {
      customerRepo.findById.mockResolvedValue(null);

      await expect(service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID)).rejects.toThrow(UnsellableOrderReferenceError);
      expect(orderRepo.create).not.toHaveBeenCalled();
    });

    it('rejects a soft-deleted customer', async () => {
      customerRepo.findById.mockResolvedValue(customer('customer-uuid-1', false));

      await expect(service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID)).rejects.toThrow(/inactive/i);
      expect(orderRepo.create).not.toHaveBeenCalled();
    });

    it('snapshots customerName from the customer record, not from the request', async () => {
      orderRepo.create.mockResolvedValue(sampleOrder());

      await service.create(
        { ...sampleCreateDto, customerName: 'Nombre inventado' } as never,
        ACTOR_COMPANY_USER_ID,
      );

      const persisted = orderRepo.create.mock.calls[0]?.[0] as DomainOrder;
      expect(persisted.customerName).toBe('Ana Torres');
    });
  });

  // R17. Whether a product has a commission configured says nothing about
  // whether it can be sold. Making resolvability a creation invariant would let
  // an unfinished commission table block the shop from taking orders — the
  // failure mode would be catastrophic and the coupling is entirely avoidable.
  describe('create — commission configuration is not a creation invariant', () => {
    it('creates an order for a product with no commission reference, consulting commission not at all', async () => {
      orderRepo.create.mockResolvedValue(sampleOrder());

      const result = await service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID);

      expect(result.id).toBeDefined();
      expect(commissionRecorder.recordForDeliveredOrder).not.toHaveBeenCalled();
    });
  });

  describe('create — sales attribution comes from the actor, never the request', () => {
    it('persists the actor as attributedCompanyUserId', async () => {
      orderRepo.create.mockResolvedValue(sampleOrder());

      await service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID);

      const persisted = orderRepo.create.mock.calls[0]?.[0] as DomainOrder;
      expect(persisted.attributedCompanyUserId).toBe(ACTOR_COMPANY_USER_ID);
    });

    it('IGNORES an attributedCompanyUserId smuggled into the request body', async () => {
      // This app installs no ValidationPipe, so the stray key really does
      // survive into the DTO object. What must hold is that nothing reads it:
      // the persisted attribution is the actor's, not the smuggled one.
      // Otherwise any caller could credit someone else's commission to
      // themselves.
      orderRepo.create.mockResolvedValue(sampleOrder());

      await service.create(
        { ...sampleCreateDto, attributedCompanyUserId: 'cu-someone-else' } as never,
        ACTOR_COMPANY_USER_ID,
      );

      const persisted = orderRepo.create.mock.calls[0]?.[0] as DomainOrder;
      expect(persisted.attributedCompanyUserId).toBe(ACTOR_COMPANY_USER_ID);
    });
  });

  describe('create — the target warehouse must be a real, active warehouse', () => {
    it('rejects an unknown warehouseId as a BAD REQUEST, not as a stock shortage', async () => {
      // Reporting "cannot fulfill every line" for a warehouse that does not
      // exist would blame the stock for a typo. Different failure, different
      // error — and the DB FK must never be what catches this.
      warehouseRepo.findById.mockResolvedValue(null);

      await expect(service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID)).rejects.toThrow(UnsellableOrderReferenceError);
      await expect(service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID)).rejects.toThrow(/not found/i);
      expect(orderRepo.create).not.toHaveBeenCalled();
    });

    it('rejects a soft-deleted (inactive) warehouse even when it still holds stock', async () => {
      // The eligibility read lists ACTIVE warehouses only. If creation
      // accepted an inactive one, the write would take what the read says
      // does not qualify.
      warehouseRepo.findById.mockResolvedValue(warehouse('warehouse-uuid-1', false));
      stockRepo.list.mockResolvedValue([stockLevel('warehouse-uuid-1', 'product-uuid-1', 999)]);

      await expect(service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID)).rejects.toThrow(UnsellableOrderReferenceError);
      await expect(service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID)).rejects.toThrow(/inactive/i);
      expect(orderRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('create — availability invariant', () => {
    it('rejects a warehouse that cannot cover the basket, WITHOUT writing an order', async () => {
      stockRepo.list.mockResolvedValue([stockLevel('warehouse-uuid-1', 'product-uuid-1', 0)]);

      await expect(service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID)).rejects.toThrow(
        WarehouseCannotFulfillOrderError,
      );
      expect(orderRepo.create).not.toHaveBeenCalled();
    });

    it('rejects when onHand looks sufficient but the stock is already reserved', async () => {
      stockRepo.list.mockResolvedValue([stockLevel('warehouse-uuid-1', 'product-uuid-1', 1, 1)]);

      await expect(service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID)).rejects.toThrow(
        WarehouseCannotFulfillOrderError,
      );
      expect(orderRepo.create).not.toHaveBeenCalled();
    });

    it('rejects when the warehouse has no stock row for a requested product at all', async () => {
      stockRepo.list.mockResolvedValue([stockLevel('some-other-warehouse', 'product-uuid-1', 999)]);

      await expect(service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID)).rejects.toThrow(
        WarehouseCannotFulfillOrderError,
      );
      expect(orderRepo.create).not.toHaveBeenCalled();
    });

    it('creates normally when the warehouse covers the basket', async () => {
      stockRepo.list.mockResolvedValue([stockLevel('warehouse-uuid-1', 'product-uuid-1', 1)]);
      orderRepo.create.mockResolvedValue(sampleOrder());

      await expect(service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID)).resolves.toMatchObject({ id: 'order-uuid-1' });
      expect(orderRepo.create).toHaveBeenCalledTimes(1);
    });

    it('reserves nothing at creation — this is a fast-fail, not a hold', async () => {
      orderRepo.create.mockResolvedValue(sampleOrder());

      await service.create(sampleCreateDto, ACTOR_COMPANY_USER_ID);

      expect(stockRepo.reserve).not.toHaveBeenCalled();
      expect(stockRepo.release).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('NEVER forwards attribution to the repository, even when the patch names one', async () => {
      // `OrderUpdateInput` is a `Partial<Order>`, so attribution is patchable
      // through the port's type. The spec says it never changes once stamped,
      // so `update` forwards an explicit allow-list rather than spreading the
      // patch. This pins that: re-attributing a sale after the fact would
      // silently move a commission from one agent to another.
      orderRepo.findById.mockResolvedValue(sampleOrder());
      orderRepo.update.mockResolvedValue(sampleOrder());

      await service.update('order-uuid-1', {
        deliveryMode: 'delivery',
        attributedCompanyUserId: 'cu-someone-else',
      } as never);

      const forwarded = orderRepo.update.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(forwarded).not.toHaveProperty('attributedCompanyUserId');
    });

    it('re-validates availability when warehouseId actually changes, and rejects a short one', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder());
      stockRepo.list.mockResolvedValue([stockLevel('warehouse-uuid-2', 'product-uuid-1', 0)]);

      await expect(
        service.update('order-uuid-1', { warehouseId: 'warehouse-uuid-2' }),
      ).rejects.toThrow(WarehouseCannotFulfillOrderError);
      expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('rejects an invalid deliveryMode instead of casting it through to the repository', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder());

      await expect(
        service.update('order-uuid-1', { deliveryMode: 'banana' } as never),
      ).rejects.toThrow(InvalidOrderError);
      expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('accepts the two valid delivery modes', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder());
      orderRepo.update.mockResolvedValue(sampleOrder({ deliveryMode: 'delivery' }));

      await expect(
        service.update('order-uuid-1', { deliveryMode: 'delivery' }),
      ).resolves.toMatchObject({ deliveryMode: 'delivery' });
    });

    it('rejects moving an order to an unknown warehouse', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder());
      warehouseRepo.findById.mockResolvedValue(null);

      await expect(
        service.update('order-uuid-1', { warehouseId: 'ghost-warehouse' }),
      ).rejects.toThrow(UnsellableOrderReferenceError);
      expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('rejects moving an order to a soft-deleted warehouse that still holds stock', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder());
      warehouseRepo.findById.mockResolvedValue(warehouse('warehouse-uuid-2', false));
      stockRepo.list.mockResolvedValue([stockLevel('warehouse-uuid-2', 'product-uuid-1', 999)]);

      await expect(
        service.update('order-uuid-1', { warehouseId: 'warehouse-uuid-2' }),
      ).rejects.toThrow(UnsellableOrderReferenceError);
      expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('allows a warehouse change to one that covers the basket', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder());
      stockRepo.list.mockResolvedValue([stockLevel('warehouse-uuid-2', 'product-uuid-1', 5)]);
      orderRepo.update.mockResolvedValue(sampleOrder({ warehouseId: 'warehouse-uuid-2' }));

      const result = await service.update('order-uuid-1', { warehouseId: 'warehouse-uuid-2' });

      expect(result?.warehouseId).toBe('warehouse-uuid-2');
    });

    it('reads no stock at all when the patch does not touch warehouseId', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder());
      orderRepo.update.mockResolvedValue(sampleOrder());

      await service.update('order-uuid-1', { deliveryMode: 'delivery' });

      expect(stockRepo.list).not.toHaveBeenCalled();
    });

    it('reads no stock when warehouseId is present but unchanged', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder());
      orderRepo.update.mockResolvedValue(sampleOrder());

      await service.update('order-uuid-1', { warehouseId: 'warehouse-uuid-1' });

      expect(stockRepo.list).not.toHaveBeenCalled();
    });

    it('updates while status is created', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder());
      orderRepo.update.mockResolvedValue(sampleOrder({ deliveryMode: 'delivery' }));

      const result = await service.update('order-uuid-1', { deliveryMode: 'delivery' });

      expect(result?.deliveryMode).toBe('delivery');
    });

    it('rejects updating a verified order with InvalidOrderStateError, WITHOUT calling repo.update', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder({ status: 'verified' }));

      await expect(
        service.update('order-uuid-1', { deliveryMode: 'delivery' }),
      ).rejects.toThrow(InvalidOrderStateError);
      expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('returns null when the order does not exist', async () => {
      orderRepo.findById.mockResolvedValue(null);

      const result = await service.update('unknown-id', { deliveryMode: 'delivery' });

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('maps the found row to a response DTO', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder());

      const result = await service.findById('order-uuid-1');

      expect(result?.id).toBe('order-uuid-1');
      expect(result?.lines).toHaveLength(1);
      expect(result?.payments).toHaveLength(1);
      expect(result?.saleCredit).toBeNull();
    });

    it('returns null when not found', async () => {
      orderRepo.findById.mockResolvedValue(null);

      const result = await service.findById('unknown-id');

      expect(result).toBeNull();
    });

    it('computes statusLabel/deliveryModeLabel in neutral LatAm Spanish alongside the English keys', async () => {
      orderRepo.findById.mockResolvedValue(
        sampleOrder({ status: 'verified', deliveryMode: 'delivery' }),
      );

      const result = await service.findById('order-uuid-1');

      expect(result?.status).toBe('verified');
      expect(result?.statusLabel).toBe('Verificado');
      expect(result?.deliveryMode).toBe('delivery');
      expect(result?.deliveryModeLabel).toBe('Envío a domicilio');
    });
  });

  describe('list', () => {
    it('maps every repository row to a response DTO', async () => {
      orderRepo.list.mockResolvedValue([sampleOrder()]);

      const result = await service.list();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('order-uuid-1');
    });
  });
});
