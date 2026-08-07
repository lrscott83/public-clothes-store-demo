import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { IOrderDeliveryGateway, IOrderRepository, Order } from '@store-mgmt/domain';
import { ORDER_REPOSITORY } from '@store-mgmt/domain';
import { OrderService } from './order.service.js';

/**
 * Implements `IOrderDeliveryGateway` (design §2 ADR-1, Direction A:
 * Delivery -> Sales). Lives in SALES' own app folder, mirroring
 * `CommissionAccrualRecorder`'s placement (Sales knows HOW, Delivery only
 * declares that it NEEDS the transition).
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
 * `IOrderRepository` is injected ONLY for a READ (`findById`) after that
 * write has already completed, to materialize the domain `Order` the port's
 * return type requires — `OrderService`'s public surface only ever returns
 * `OrderResponseDto` (a wire shape with ISO date strings and decimal-string
 * money), never the domain entity, and `order.service.ts` is intentionally
 * left unmodified by this change (design §7's file map does not list it).
 * This read carries no risk to the single-write-path invariant above: it
 * observes state, it never mutates it.
 */
@Injectable()
export class OrderDeliveryGatewayAdapter implements IOrderDeliveryGateway {
  constructor(
    private readonly orderService: OrderService,
    @Inject(ORDER_REPOSITORY) private readonly orderRepository: IOrderRepository,
  ) {}

  async markOrderDelivered(orderId: string): Promise<Order> {
    const delivered = await this.orderService.deliver(orderId);
    if (!delivered) {
      throw new NotFoundException(`Order "${orderId}" not found`);
    }

    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      // Cannot happen in practice — `orderService.deliver` above just
      // confirmed the order exists and completed its transition in the same
      // tenant schema. Guarded anyway: `findById` is typed nullable and a
      // thrown 404 here is a truthful description of the (unreachable)
      // alternative, never a fabricated `Order`.
      throw new NotFoundException(`Order "${orderId}" not found after delivery`);
    }
    return order;
  }
}
