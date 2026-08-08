import { Test, TestingModule } from '@nestjs/testing';
import { ORDER_REPOSITORY, OrderNotFoundForDeliveryError } from '@store-mgmt/domain';
import { OrderDeliveryGatewayAdapter } from './order-delivery-gateway.adapter.js';
import { OrderService } from './order.service.js';
import type { OrderResponseDto } from './dto/index.js';

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
  let orderService: { deliver: jest.Mock; findById: jest.Mock };
  let orderRepository: { findScopeProjection: jest.Mock; findById: jest.Mock };

  beforeEach(async () => {
    orderService = { deliver: jest.fn(), findById: jest.fn() };
    orderRepository = { findScopeProjection: jest.fn(), findById: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderDeliveryGatewayAdapter,
        { provide: OrderService, useValue: orderService },
        { provide: ORDER_REPOSITORY, useValue: orderRepository },
      ],
    }).compile();
    adapter = module.get(OrderDeliveryGatewayAdapter);
  });

  describe('markOrderDelivered', () => {
    it('delegates to OrderService.deliver(orderId) — NOT to IOrderRepository.deliver directly — so commission accrual keeps firing through the one existing path', async () => {
      orderService.deliver.mockResolvedValue(orderResponseDto());

      await expect(adapter.markOrderDelivered('order-1')).resolves.toBeUndefined();

      expect(orderService.deliver).toHaveBeenCalledWith('order-1');
    });

    it('issues NO extra aggregate read — the port returns void, so nothing has to be materialized', async () => {
      orderService.deliver.mockResolvedValue(orderResponseDto());

      await adapter.markOrderDelivered('order-1');

      // The old signature (`Promise<Order>`) forced a full `findById` —
      // lines, payments and credit loaded — purely to satisfy a return value
      // every caller discarded.
      expect(orderService.findById).not.toHaveBeenCalled();
    });

    it('throws the DOMAIN OrderNotFoundForDeliveryError, never a NestJS HttpException, when the order is unknown', async () => {
      orderService.deliver.mockResolvedValue(null);

      // This class implements a PURE domain port; an HTTP exception thrown
      // from here leaks the delivery mechanism into the domain contract. The
      // controller maps it — and can phrase it in terms of what the client
      // actually asked for (an assignment), instead of naming an order.
      await expect(adapter.markOrderDelivered('missing-order')).rejects.toThrow(
        OrderNotFoundForDeliveryError,
      );
    });
  });

  describe('findOrderSnapshot', () => {
    it('returns only the delivery-shaped facts Delivery needs', async () => {
      orderRepository.findScopeProjection.mockResolvedValue({
        orderId: 'order-1',
        warehouseId: 'warehouse-A',
        deliveryMode: 'delivery',
        status: 'verified',
      });

      const snapshot = await adapter.findOrderSnapshot('order-1');

      expect(snapshot).toEqual({
        orderId: 'order-1',
        warehouseId: 'warehouse-A',
        deliveryMode: 'delivery',
        status: 'verified',
      });
      expect(orderService.deliver).not.toHaveBeenCalled();
    });

    /**
     * CLASS G1 — the port's doc comment says this snapshot exists because
     * loading the full aggregate to read three scalars is a wasted read. It
     * used to be served from `OrderService.findById`, which loads exactly
     * that aggregate — on the hot path of every `assign` and every scoped
     * `markDelivered`. The claim was true of the TYPE and false of the
     * implementation.
     */
    it('reads the NARROW projection and never the full aggregate', async () => {
      orderRepository.findScopeProjection.mockResolvedValue({
        orderId: 'order-1',
        warehouseId: 'warehouse-A',
        deliveryMode: 'delivery',
        status: 'verified',
      });

      await adapter.findOrderSnapshot('order-1');

      expect(orderRepository.findScopeProjection).toHaveBeenCalledWith('order-1');
      expect(orderService.findById).not.toHaveBeenCalled();
      expect(orderRepository.findById).not.toHaveBeenCalled();
    });

    it('returns null for an unknown order — not an error at this layer', async () => {
      orderRepository.findScopeProjection.mockResolvedValue(null);

      await expect(adapter.findOrderSnapshot('missing-order')).resolves.toBeNull();
    });
  });
});
