import type { DeliveryAssignment } from './delivery-assignment.js';

/** Optional `[from,to]` window — both bounds inclusive, either or both may be omitted (all-time). */
export interface ComputeCarrierThroughputWindow {
  readonly from?: Date;
  readonly to?: Date;
}

/**
 * PURE fold. Counts `delivered` assignments per carrier over an optional
 * `[from,to]` window on `deliveredAt` (design §6: "how much each carrier
 * delivered"). `in_transit` rows never count — throughput measures
 * completed deliveries only.
 *
 * Returns a `Map` (not an array) so the read surface can look up one
 * carrier's count directly without a linear scan.
 */
export function computeCarrierThroughput(
  assignments: readonly DeliveryAssignment[],
  window?: ComputeCarrierThroughputWindow,
): ReadonlyMap<string, number> {
  const deliveredCountByCarrier = new Map<string, number>();

  for (const assignment of assignments) {
    if (assignment.status !== 'delivered' || assignment.deliveredAt === null) continue;
    if (window?.from && assignment.deliveredAt < window.from) continue;
    if (window?.to && assignment.deliveredAt > window.to) continue;

    deliveredCountByCarrier.set(
      assignment.carrierId,
      (deliveredCountByCarrier.get(assignment.carrierId) ?? 0) + 1,
    );
  }

  return deliveredCountByCarrier;
}
