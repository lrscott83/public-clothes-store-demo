/**
 * Wire shapes for the Delivery read surface (design §6). Phase 4 is READS
 * ONLY — no write DTOs here yet (`CreateCarrierDto`/`AssignCarrierDto`
 * arrive with Phase 6's write handlers).
 */

/**
 * `coversWarehouse` is present only when the caller asked
 * (`GET /delivery/carriers?warehouseId=<uuid>`) — ADR-4: coverage is
 * advisory and surfaced on reads only, `undefined` when there is no
 * warehouse to check coverage against.
 */
export interface CarrierResponseDto {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  coversWarehouse?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryAssignmentResponseDto {
  id: string;
  orderId: string;
  carrierId: string;
  status: 'in_transit' | 'delivered';
  assignedAt: string;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One carrier's busy/free + throughput reading (design §4/§6, ADR-3). */
export interface CarrierCapacityRowDto {
  carrierId: string;
  carrierName: string;
  busy: boolean;
  inTransitCount: number;
  deliveredCount: number;
}

export interface CarrierCapacityResponseDto {
  carriers: CarrierCapacityRowDto[];
  busyCount: number;
  freeCount: number;
  /** Count of ORDERS, not carriers — `countOrdersAwaitingCarrier()`'s anti-join (design §4). */
  ordersAwaitingCarrier: number;
}
