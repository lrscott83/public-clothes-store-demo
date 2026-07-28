import { Test, TestingModule } from '@nestjs/testing';
import type {
  ICurrencyRepository,
  IOrderRepository,
  IStockLevelRepository,
  Order as DomainOrder,
  StockLevel,
} from '@store-mgmt/domain';
import {
  CURRENCY_REPOSITORY,
  InsufficientStockError,
  InvalidOrderStateError,
  NegativeStockError,
  ORDER_REPOSITORY,
  RateNotFoundError,
  STOCK_LEVEL_REPOSITORY,
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
    orderDate: at,
    verifiedAt: null,
    deliveredAt: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

const sampleCreateDto: CreateOrderDto = {
  customerId: 'customer-uuid-1',
  customerName: 'Ana Torres',
  warehouseId: 'warehouse-uuid-1',
  deliveryMode: 'pickup',
  lines: [
    {
      productId: 'product-uuid-1',
      productName: 'Cafetera Express',
      categoryName: 'Cafeteras',
      price: { amount: '100.00', currency: 'USD' },
      quantity: 1,
    },
  ],
  payments: [{ channel: 'USD_CASH', amount: { amount: '100.00', currency: 'USD' } }],
};

describe('OrderService', () => {
  let service: OrderService;
  let orderRepo: jest.Mocked<IOrderRepository>;
  let currencyRepo: jest.Mocked<ICurrencyRepository>;
  let stockRepo: jest.Mocked<IStockLevelRepository>;

  beforeEach(async () => {
    orderRepo = buildOrderRepoMock();
    currencyRepo = buildCurrencyRepoMock();
    stockRepo = buildStockLevelRepoMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: ORDER_REPOSITORY, useValue: orderRepo },
        { provide: CURRENCY_REPOSITORY, useValue: currencyRepo },
        { provide: STOCK_LEVEL_REPOSITORY, useValue: stockRepo },
      ],
    }).compile();
    service = module.get(OrderService);
  });

  describe('create', () => {
    it('loads rates, runs createOrder to build the aggregate, THEN persists it via the repository', async () => {
      orderRepo.create.mockResolvedValue(sampleOrder());

      const result = await service.create(sampleCreateDto);

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
      const crossCurrencyDto: CreateOrderDto = {
        ...sampleCreateDto,
        lines: [
          {
            productId: 'product-uuid-2',
            productName: 'Reloj',
            categoryName: 'Accesorios',
            price: { amount: '50.00', currency: 'EUR' },
            quantity: 1,
          },
        ],
        payments: [{ channel: 'EUR_CASH', amount: { amount: '50.00', currency: 'EUR' } }],
      };

      await expect(service.create(crossCurrencyDto)).rejects.toThrow(RateNotFoundError);
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

    it('cancel delegates straight to the repository and propagates InvalidOrderStateError unmapped', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder({ status: 'delivered' }));
      orderRepo.cancel.mockRejectedValue(
        new InvalidOrderStateError('order-uuid-1', 'created|verified', 'delivered'),
      );

      await expect(service.cancel('order-uuid-1')).rejects.toThrow(InvalidOrderStateError);
    });
  });

  describe('create — availability invariant', () => {
    it('rejects a warehouse that cannot cover the basket, WITHOUT writing an order', async () => {
      stockRepo.list.mockResolvedValue([stockLevel('warehouse-uuid-1', 'product-uuid-1', 0)]);

      await expect(service.create(sampleCreateDto)).rejects.toThrow(
        WarehouseCannotFulfillOrderError,
      );
      expect(orderRepo.create).not.toHaveBeenCalled();
    });

    it('rejects when onHand looks sufficient but the stock is already reserved', async () => {
      stockRepo.list.mockResolvedValue([stockLevel('warehouse-uuid-1', 'product-uuid-1', 1, 1)]);

      await expect(service.create(sampleCreateDto)).rejects.toThrow(
        WarehouseCannotFulfillOrderError,
      );
      expect(orderRepo.create).not.toHaveBeenCalled();
    });

    it('rejects when the warehouse has no stock row for a requested product at all', async () => {
      stockRepo.list.mockResolvedValue([stockLevel('some-other-warehouse', 'product-uuid-1', 999)]);

      await expect(service.create(sampleCreateDto)).rejects.toThrow(
        WarehouseCannotFulfillOrderError,
      );
      expect(orderRepo.create).not.toHaveBeenCalled();
    });

    it('creates normally when the warehouse covers the basket', async () => {
      stockRepo.list.mockResolvedValue([stockLevel('warehouse-uuid-1', 'product-uuid-1', 1)]);
      orderRepo.create.mockResolvedValue(sampleOrder());

      await expect(service.create(sampleCreateDto)).resolves.toMatchObject({ id: 'order-uuid-1' });
      expect(orderRepo.create).toHaveBeenCalledTimes(1);
    });

    it('reserves nothing at creation — this is a fast-fail, not a hold', async () => {
      orderRepo.create.mockResolvedValue(sampleOrder());

      await service.create(sampleCreateDto);

      expect(stockRepo.reserve).not.toHaveBeenCalled();
      expect(stockRepo.release).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('re-validates availability when warehouseId actually changes, and rejects a short one', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder());
      stockRepo.list.mockResolvedValue([stockLevel('warehouse-uuid-2', 'product-uuid-1', 0)]);

      await expect(
        service.update('order-uuid-1', { warehouseId: 'warehouse-uuid-2' }),
      ).rejects.toThrow(WarehouseCannotFulfillOrderError);
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
      orderRepo.update.mockResolvedValue(sampleOrder({ customerName: 'New Name' }));

      await service.update('order-uuid-1', { customerName: 'New Name' });

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
      orderRepo.update.mockResolvedValue(sampleOrder({ customerName: 'New Name' }));

      const result = await service.update('order-uuid-1', { customerName: 'New Name' });

      expect(result?.customerName).toBe('New Name');
    });

    it('rejects updating a verified order with InvalidOrderStateError, WITHOUT calling repo.update', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder({ status: 'verified' }));

      await expect(
        service.update('order-uuid-1', { customerName: 'New Name' }),
      ).rejects.toThrow(InvalidOrderStateError);
      expect(orderRepo.update).not.toHaveBeenCalled();
    });

    it('returns null when the order does not exist', async () => {
      orderRepo.findById.mockResolvedValue(null);

      const result = await service.update('unknown-id', { customerName: 'X' });

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
