import { Inject, Injectable } from '@nestjs/common';
import type { IOrderDeliveryGateway, IOrderRepository, OrderDeliverySnapshot } from '@store-mgmt/domain';
import { ORDER_REPOSITORY, OrderNotFoundForDeliveryError } from '@store-mgmt/domain';
import { OrderService } from './order.service.js';

/**
 * Implements `IOrderDeliveryGateway` (design §2 ADR-1, Direction A:
 * Delivery -> Sales). Lives in SALES' own app folder, mirroring
 * `CommissionAccrualRecorder`'s placement (Sales knows HOW, Delivery only
 * declares that it NEEDS the transition and the facts it decides on).
 *
 * The WRITE always goes through `OrderService.deliver(orderId)` — NEVER
 * `IOrderRepository.deliver` directly. That is the whole point of routing
 * through the service: `OrderService.deliver` is the one method that also
 * triggers the commission accrual recorder (in its own try/catch). Calling
 * the repository's `deliver` here instead would either silently stop
 * accrual for every order delivered through Delivery, or, if some future
 * change added accrual there too, introduce a SECOND accrual trigger for
 * the same event. One transition, one path, whichever door the caller used.
 *
 * The READ goes the other way, straight to `IOrderRepository`, and
 * specifically to `findScopeProjection` — four columns, no joins. It used to
 * go through `OrderService.findById`, which loads the FULL `Order` aggregate
 * (lines, payments, credit, plus every per-line Money/rate reconstruction) to
 * answer three scalars, on the hot path of every `assign` and every scoped
 * `markDelivered`. `OrderDeliverySnapshot`'s own port doc has always said
 * that read is wasted; this is what makes the claim true instead of
 * aspirational. `IOrderRepository` is injected for THIS and nothing else —
 * it is deliberately not used for the write.
 *
 * Errors are DOMAIN errors, never NestJS `HttpException`s: this class
 * implements a pure domain port, and the controller that owns the HTTP
 * contract does the mapping.
 */
@Injectable()
export class OrderDeliveryGatewayAdapter implements IOrderDeliveryGateway {
  constructor(
    private readonly orderService: OrderService,
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository,
  ) {}

  /**
   * The Sales-owned `OrderScopeProjection` mapped onto Delivery's own
   * `OrderDeliverySnapshot`. The two carry the same four scalars but are
   * declared by different modules on purpose — a type declared by Delivery
   * and returned by a Sales port would point the dependency the wrong way.
   * The mapping is this adapter's whole job.
   */
  async findOrderSnapshot(orderId: string): Promise<OrderDeliverySnapshot | null> {
    const found = await this.orderRepository.findScopeProjection(orderId);
    if (!found) {
      return null;
    }
    return {
      orderId: found.orderId,
      warehouseId: found.warehouseId,
      deliveryMode: found.deliveryMode,
      status: found.status,
    };
  }

  async markOrderDelivered(orderId: string): Promise<void> {
    const delivered = await this.orderService.deliver(orderId);
    if (!delivered) {
      throw new OrderNotFoundForDeliveryError(orderId);
    }
  }
}
