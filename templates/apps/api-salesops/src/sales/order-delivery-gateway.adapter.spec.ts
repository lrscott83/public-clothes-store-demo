import { Test, TestingModule } from '@nestjs/testing';
import type { IOrderRepository, Order as DomainOrder } from '@store-mgmt/domain';
import { ORDER_REPOSITORY } from '@store-mgmt/domain';
import { OrderDeliveryGatewayAdapter } from './order-delivery-gateway.adapter.js';
import { OrderService } from './order.service.js';
import type { OrderResponseDto } from './dto/index.js';

function domainOrder(overrides: Partial<DomainOrder> = {}): DomainOrder {
  const at = new Date('2026-08-06T12:00:00.000Z');
  return {
    id: 'order-1',
    customerId: 'customer-1',
    customerName: 'Ana Torres',
    warehouseId: 'warehouse-1',
    deliveryMode: 'delivery',
    currency: 'USD',
    status: 'delivered',
    subtotal: { minorUnits: 10000n, currency: 'USD' },
    discountTotal: { minorUnits: 0n, currency: 'USD' },
    total: { minorUnits: 10000n, currency: 'USD' },
    lines: [],
    payments: [],
    saleCredit: null,
    attributedCompanyUserId: 'user-1',
    orderDate: at,
    verifiedAt: at,
    deliveredAt: at,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function orderResponseDto(overrides: Partial<OrderResponseDto> = {}): OrderResponseDto {
  return {
    id: 'order-1',
    customerId: 'customer-1',
    customerName: 'Ana Torres',
    warehouseId: 'warehouse-1',
    deliveryMode: 'delivery',
    deliveryModeLabel: 'Delivery',
    currency: 'USD',
    status: 'delivered',
    statusLabel: 'Delivered',
    subtotal: '100.00',
    discountTotal: '0.00',
    total: '100.00',
    lines: [],
    payments: [],
    saleCredit: null,
    attributedCompanyUserId: 'user-1',
    orderDate: '2026-08-06T12:00:00.000Z',
    verifiedAt: '2026-08-06T12:00:00.000Z',
    deliveredAt: '2026-08-06T12:00:00.000Z',
    createdAt: '2026-08-06T12:00:00.000Z',
    updatedAt: '2026-08-06T12:00:00.000Z',
    ...overrides,
  } as OrderResponseDto;
}

describe('OrderDeliveryGatewayAdapter', () => {
  let adapter: OrderDeliveryGatewayAdapter;
  let orderService: { deliver: jest.Mock };
  let orderRepository: jest.Mocked<Pick<IOrderRepository, 'findById'>>;

  beforeEach(async () => {
    orderService = { deliver: jest.fn() };
    orderRepository = { findById: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderDeliveryGatewayAdapter,
        { provide: OrderService, useValue: orderService },
        { provide: ORDER_REPOSITORY, useValue: orderRepository },
      ],
    }).compile();
    adapter = module.get(OrderDeliveryGatewayAdapter);
  });

  it('delegates to OrderService.deliver(orderId) — NOT to IOrderRepository.deliver directly — so commission accrual keeps firing through the one existing path', async () => {
    orderService.deliver.mockResolvedValue(orderResponseDto());
    orderRepository.findById.mockResolvedValue(domainOrder());

    const result = await adapter.markOrderDelivered('order-1');

    expect(orderService.deliver).toHaveBeenCalledWith('order-1');
    // `IOrderRepository.deliver` (the WRITE) must never be called by this
    // adapter — only `findById` (a READ, after the write already completed
    // through `OrderService.deliver`) to materialize the domain `Order` the
    // port's return type requires.
    expect(orderRepository.findById).toHaveBeenCalledWith('order-1');
    expect(result.id).toBe('order-1');
    expect(result.status).toBe('delivered');
  });

  it('throws when OrderService.deliver resolves null (unknown order id) — never reads the repository', async () => {
    orderService.deliver.mockResolvedValue(null);

    await expect(adapter.markOrderDelivered('missing-order')).rejects.toThrow();
    expect(orderRepository.findById).not.toHaveBeenCalled();
  });
});
