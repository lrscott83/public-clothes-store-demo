import type { Carrier } from './carrier.js';
import type { DeliveryAssignment } from './delivery-assignment.js';

/** One carrier's busy/free reading, re-derivable at any time (design §4, ADR-3). */
export interface CarrierCapacityRow {
  readonly carrierId: string;
  readonly carrierName: string;
  readonly busy: boolean;
  readonly inTransitCount: number;
}

export interface CarrierCapacity {
  readonly carriers: readonly CarrierCapacityRow[];
  readonly busyCount: number;
  readonly freeCount: number;
}

/**
 * PURE. No query in the domain — the application service loads the
 * snapshot (all carriers + all open assignments), this function only
 * decides. `openAssignments` may carry ANY status; only `in_transit` rows
 * count toward busyness (`delivered` and `cancelled` ones are ignored here,
 * not by the caller pre-filtering — see the mixed-list triangulation in the
 * test). `cancelled` never makes a carrier busy: that is the whole point of
 * the state — a cancelled order must release its carrier.
 *
 * A carrier is BUSY when it has one or more `in_transit` assignments;
 * otherwise FREE. No cached/persisted number — recomputed from live rows
 * every call (D3/D4: "no stale stored value persists").
 */
export function computeCarrierCapacity(
  carriers: readonly Carrier[],
  openAssignments: readonly DeliveryAssignment[],
): CarrierCapacity {
  const inTransitCountByCarrier = new Map<string, number>();
  for (const assignment of openAssignments) {
    if (assignment.status !== 'in_transit') continue;
    inTransitCountByCarrier.set(
      assignment.carrierId,
      (inTransitCountByCarrier.get(assignment.carrierId) ?? 0) + 1,
    );
  }

  const rows: CarrierCapacityRow[] = carriers.map((carrier) => {
    const inTransitCount = inTransitCountByCarrier.get(carrier.id) ?? 0;
    return {
      carrierId: carrier.id,
      carrierName: carrier.name,
      busy: inTransitCount > 0,
      inTransitCount,
    };
  });

  const busyCount = rows.filter((row) => row.busy).length;
  const freeCount = rows.length - busyCount;

  return { carriers: rows, busyCount, freeCount };
}
