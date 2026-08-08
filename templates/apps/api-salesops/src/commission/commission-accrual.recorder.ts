import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  CommissionAccrual,
  ICommissionAccrualRecorder,
  ICommissionAccrualRepository,
  ICommissionReferenceProvider,
  Order,
} from '@store-mgmt/domain';
import {
  COMMISSION_ACCRUAL_REPOSITORY,
  COMMISSION_REFERENCE_PROVIDER,
  computeAccrual,
} from '@store-mgmt/domain';

/**
 * Turns a delivered order into an accrual. The implementation behind the port
 * `OrderService.deliver` calls.
 *
 * Every path out of here is either a recorded accrual or an explicit refusal —
 * there is no branch that invents an amount or an agent. That is the whole
 * design of this class: commission is money owed to a person, so when the
 * inputs do not support a conclusion, the answer is `null` and a log line, not
 * a plausible number.
 */
@Injectable()
export class CommissionAccrualRecorder implements ICommissionAccrualRecorder {
  private readonly logger = new Logger(CommissionAccrualRecorder.name);

  constructor(
    @Inject(COMMISSION_ACCRUAL_REPOSITORY)
    private readonly accrualRepository: ICommissionAccrualRepository,
    @Inject(COMMISSION_REFERENCE_PROVIDER)
    private readonly referenceProvider: ICommissionReferenceProvider,
  ) {}

  async recordForDeliveredOrder(order: Order): Promise<CommissionAccrual | null> {
    // Commission is earned by DELIVERY. Nothing else calls this today, so this
    // is a pin rather than a gate — it exists so a future caller cannot quietly
    // accrue on `created` or on a cancelled sale.
    if (order.status !== 'delivered') {
      return null;
    }

    if (order.attributedCompanyUserId === null) {
      // An order predating the attribution cutover. Picking an agent for it —
      // the creator, the only active one, anyone — would fabricate financial
      // evidence, so it is declined. Logged rather than swallowed: this is a
      // real gap in the data and somebody should be able to count them.
      this.logger.warn(`UNATTRIBUTED_ORDER: order "${order.id}" delivered with no attributed agent; no accrual recorded`);
      return null;
    }

    // Create-if-absent starts here, not at the repository: skipping the
    // reference lookup entirely on a re-delivery keeps the idempotent path
    // cheap and, more importantly, means a since-edited commission table is
    // never even read for an order that was already settled.
    const existing = await this.accrualRepository.findByOrderId(order.id);
    if (existing) {
      return existing;
    }

    const references = await this.referenceProvider.commissionsFor(
      order.lines.map((line) => line.productId),
    );

    const accrual = computeAccrual(
      {
        orderId: order.id,
        attributedCompanyUserId: order.attributedCompanyUserId,
        lines: order.lines.map((line) => ({
          orderLineId: line.id,
          productId: line.productId,
          quantity: line.quantity,
        })),
      },
      references,
      new Date(),
    );

    if (accrual.unresolved.length > 0) {
      this.logger.warn(
        `UNRESOLVED_COMMISSION_LINES: order "${order.id}" has ${accrual.unresolved.length} line(s) ` +
          'whose product has no commission reference; they are excluded from the total, not zeroed',
      );
    }

    return this.accrualRepository.create(accrual);
  }
}
