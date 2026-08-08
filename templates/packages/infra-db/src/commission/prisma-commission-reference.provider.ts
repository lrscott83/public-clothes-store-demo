import { Injectable } from '@nestjs/common';
import type { ICommissionReferenceProvider, Money } from '@store-mgmt/domain';
import { moneyFromDecimalString } from '@store-mgmt/domain';
import { TenantContextService } from '../tenant/tenant-context.service.js';

/**
 * Prisma adapter for `ICommissionReferenceProvider`. A pure id lookup — every
 * name→product decision was already made and persisted by the seed.
 *
 * The whole contract of this adapter is what it does NOT do: a product with no
 * row comes back `undefined` and is never padded to zero. Downstream, that
 * absence becomes an `unresolved` accrual line — visible, fixable — instead of
 * a zero that would sum into a total and look settled.
 */
/**
 * Client source: `TenantContextService.getClient()` (design.md D2/D5) —
 * resolved fresh per call, never cached on `this` (see
 * `PrismaCurrencyRepository`'s doc comment for why).
 */
@Injectable()
export class PrismaCommissionReferenceProvider implements ICommissionReferenceProvider {
  constructor(private readonly tenantContext: TenantContextService) {}

  async commissionFor(productId: string): Promise<Money | undefined> {
    const row = await this.tenantContext
      .getClient()
      .productCommissionReference.findUnique({ where: { productId } });
    // `?? undefined` would be wrong here only if a row could carry a null
    // amount — it cannot (NOT NULL), so a missing row is the only absence.
    return row ? moneyFromDecimalString(row.amountMn.toString(), 'MN') : undefined;
  }

  async commissionsFor(productIds: readonly string[]): Promise<ReadonlyMap<string, Money>> {
    const unique = [...new Set(productIds)];
    // Guard the empty case explicitly: `IN ()` is not what Prisma emits for an
    // empty `in`, but relying on that is a detail of the client, and the query
    // is pointless anyway.
    if (unique.length === 0) {
      return new Map();
    }

    const rows = await this.tenantContext.getClient().productCommissionReference.findMany({
      where: { productId: { in: unique } },
    });

    // Keys exist ONLY for configured products. An absent key is the signal the
    // domain reads as "unresolved"; padding the map would erase that signal.
    return new Map(
      rows.map((row) => [row.productId, moneyFromDecimalString(row.amountMn.toString(), 'MN')]),
    );
  }
}
