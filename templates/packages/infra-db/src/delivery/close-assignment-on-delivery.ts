import { Prisma } from '../../generated/tenant/client.js';

/**
 * Direction B of the two-way Sales<->Delivery relationship (design.md §2B,
 * `packages/domain/src/delivery/delivery-assignment-seam.md`). Deliberately
 * NOT a NestJS port — a guarded conditional `UPDATE`, invoked INSIDE
 * `PrismaOrderRepository.deliver`'s already-open `$transaction`, mirroring
 * `applyReservationTx`'s exact style (same package, same shape: one raw
 * guarded `UPDATE`, 0 rows affected is a normal outcome, never an error).
 *
 * Closes AT MOST ONE row: the `in_transit` `DeliveryAssignment` for
 * `orderId`, if any. This is the ONLY writer of the delivered edge on
 * `DeliveryAssignment.status` — there is deliberately no `markDelivered` on
 * `IDeliveryAssignmentRepository` (design §8). Zero rows affected is the
 * NORMAL case for:
 *   - a `pickup` order (never has an assignment row at all);
 *   - an order whose assignment was already closed (idempotent re-delivery
 *     attempts never happen in practice since `delivered` is terminal, but
 *     the guard costs nothing and keeps the function total).
 * Never `findUniqueOrThrow` — an absent assignment is not an error state.
 *
 * The enum values are bound as parameters and cast through `text` — the same
 * form (and the same reason) as `cancelAssignmentOnOrderCancelTx`, whose doc
 * comment carries the full explanation. Both labels used here have existed
 * since the table did, so this file never had the bug; writing it the safe
 * way is what stops the NEXT enum addition from reintroducing it in the
 * sibling that looks identical.
 */
export async function closeAssignmentOnDeliveryTx(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`UPDATE "delivery_assignment" SET "status" = ${'delivered'}::text::"DeliveryAssignmentStatus", "delivered_at" = now(), "updated_at" = now() WHERE "order_id" = ${orderId}::uuid AND "status" = ${'in_transit'}::text::"DeliveryAssignmentStatus"`,
  );
}
