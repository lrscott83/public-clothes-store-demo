import { Test, TestingModule } from '@nestjs/testing';
import type { ICurrencyRepository, IOrderRepository, Order as DomainOrder } from '@store-mgmt/domain';
import {
  CURRENCY_REPOSITORY,
  InsufficientStockError,
  InvalidOrderStateError,
  NegativeStockError,
  ORDER_REPOSITORY,
  RateNotFoundError,
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

const at = new Date('2026-01-01T00:00:00.000Z');

function sampleOrder(overrides: Partial<DomainOrder> = {}): DomainOrder {
  return {
    id: 'order-uuid-1',
    customerId: 'customer-uuid-1',
    customerName: 'Ana Torres',
    warehouseId: 'warehouse-uuid-1',
    deliveryMode: 'recogida',
    currency: 'USD',
    status: 'creado',
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
        rateApplied: { channel: 'USD_EFECTIVO', rate: 1000000n, effectiveFrom: at },
        rateEffectiveFrom: at,
        lineTotalOrder: { minorUnits: 10000n, currency: 'USD' },
      },
    ],
    payments: [
      {
        id: 'payment-uuid-1',
        channel: 'USD_EFECTIVO',
        amount: { minorUnits: 10000n, currency: 'USD' },
        rateApplied: { channel: 'USD_EFECTIVO', rate: 1000000n, effectiveFrom: at },
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
  deliveryMode: 'recogida',
  lines: [
    {
      productId: 'product-uuid-1',
      productName: 'Cafetera Express',
      categoryName: 'Cafeteras',
      price: { amount: '100.00', currency: 'USD' },
      quantity: 1,
    },
  ],
  payments: [{ channel: 'USD_EFECTIVO', amount: { amount: '100.00', currency: 'USD' } }],
};

describe('OrderService', () => {
  let service: OrderService;
  let orderRepo: jest.Mocked<IOrderRepository>;
  let currencyRepo: jest.Mocked<ICurrencyRepository>;

  beforeEach(async () => {
    orderRepo = buildOrderRepoMock();
    currencyRepo = buildCurrencyRepoMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: ORDER_REPOSITORY, useValue: orderRepo },
        { provide: CURRENCY_REPOSITORY, useValue: currencyRepo },
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
      // already-built aggregate (status='creado', currency derived, totals
      // computed), not the raw DTO.
      expect(passedOrder.status).toBe('creado');
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
        payments: [{ channel: 'EUR_EFECTIVO', amount: { amount: '50.00', currency: 'EUR' } }],
      };

      await expect(service.create(crossCurrencyDto)).rejects.toThrow(RateNotFoundError);
      expect(orderRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('confirm/deliver/cancel', () => {
    it('confirm delegates straight to the repository and maps the response', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder());
      orderRepo.confirm.mockResolvedValue(sampleOrder({ status: 'verificado', verifiedAt: at }));

      const result = await service.confirm('order-uuid-1');

      expect(orderRepo.confirm).toHaveBeenCalledWith('order-uuid-1');
      expect(result?.status).toBe('verificado');
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
      orderRepo.findById.mockResolvedValue(sampleOrder({ status: 'verificado' }));
      orderRepo.deliver.mockRejectedValue(new NegativeStockError('onHand would go negative'));

      await expect(service.deliver('order-uuid-1')).rejects.toThrow(NegativeStockError);
      expect(orderRepo.deliver).toHaveBeenCalledWith('order-uuid-1');
    });

    it('cancel delegates straight to the repository and propagates InvalidOrderStateError unmapped', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder({ status: 'entregado' }));
      orderRepo.cancel.mockRejectedValue(
        new InvalidOrderStateError('order-uuid-1', 'creado|verificado', 'entregado'),
      );

      await expect(service.cancel('order-uuid-1')).rejects.toThrow(InvalidOrderStateError);
    });
  });

  describe('update', () => {
    it('updates while status is creado', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder());
      orderRepo.update.mockResolvedValue(sampleOrder({ customerName: 'New Name' }));

      const result = await service.update('order-uuid-1', { customerName: 'New Name' });

      expect(result?.customerName).toBe('New Name');
    });

    it('rejects updating a verificado order with InvalidOrderStateError, WITHOUT calling repo.update', async () => {
      orderRepo.findById.mockResolvedValue(sampleOrder({ status: 'verificado' }));

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
