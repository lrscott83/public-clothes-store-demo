import { Inject, Injectable } from '@nestjs/common';
import type {
  Carrier as DomainCarrier,
  DeliveryAssignment as DomainDeliveryAssignment,
  DeliveryAssignmentFilter,
  ICarrierRepository,
  ICarrierWarehouseRepository,
  IDeliveryAssignmentRepository,
} from '@store-mgmt/domain';
import {
  CARRIER_REPOSITORY,
  CARRIER_WAREHOUSE_REPOSITORY,
  DELIVERY_ASSIGNMENT_REPOSITORY,
  computeCarrierCapacity,
  computeCarrierThroughput,
} from '@store-mgmt/domain';
import type {
  CarrierCapacityResponseDto,
  CarrierResponseDto,
  DeliveryAssignmentResponseDto,
} from './dto/index.js';

export interface ListCarriersFilter {
  readonly warehouseId?: string;
}

export interface CapacityWindow {
  readonly from?: Date;
  readonly to?: Date;
}

/**
 * Orchestration layer for the Delivery read surface (design §6). Phase 4 is
 * READS ONLY — no `assign`/`markDelivered` here yet (Phase 6). Mirrors
 * `WarehouseService`'s shape: the only place with I/O, maps domain entities
 * to response DTOs (dates -> ISO strings).
 */
@Injectable()
export class DeliveryService {
  constructor(
    @Inject(CARRIER_REPOSITORY) private readonly carrierRepository: ICarrierRepository,
    @Inject(CARRIER_WAREHOUSE_REPOSITORY)
    private readonly carrierWarehouseRepository: ICarrierWarehouseRepository,
    @Inject(DELIVERY_ASSIGNMENT_REPOSITORY)
    private readonly assignmentRepository: IDeliveryAssignmentRepository,
  ) {}

  /**
   * `coversWarehouse` is added ONLY when `filter.warehouseId` is given —
   * ADR-4: coverage is advisory, exposed on reads, and the list itself is
   * NEVER filtered by it (every active carrier is always returned).
   */
  async listCarriers(filter?: ListCarriersFilter): Promise<CarrierResponseDto[]> {
    const carriers = await this.carrierRepository.list({ activeOnly: true });
    if (filter?.warehouseId === undefined) {
      return carriers.map((carrier) => this.toCarrierResponse(carrier));
    }

    const warehouseId = filter.warehouseId;
    return Promise.all(
      carriers.map(async (carrier) => {
        const coverage = await this.carrierWarehouseRepository.listByCarrier(carrier.id);
        const coversWarehouse = coverage.some((row) => row.warehouseId === warehouseId);
        return this.toCarrierResponse(carrier, coversWarehouse);
      }),
    );
  }

  async findCarrierById(id: string): Promise<CarrierResponseDto | null> {
    const found = await this.carrierRepository.findById(id);
    return found ? this.toCarrierResponse(found) : null;
  }

  async listAssignments(filter?: DeliveryAssignmentFilter): Promise<DeliveryAssignmentResponseDto[]> {
    const rows = await this.assignmentRepository.list(filter);
    return rows.map((row) => this.toAssignmentResponse(row));
  }

  /** `null` = pickup order, or delivered before this module existed — never a 404 (design §6). */
  async findAssignmentByOrderId(orderId: string): Promise<DeliveryAssignmentResponseDto | null> {
    const found = await this.assignmentRepository.findByOrderId(orderId);
    return found ? this.toAssignmentResponse(found) : null;
  }

  /**
   * Loads the snapshot (all active carriers + all `in_transit` assignments)
   * and hands it to the PURE `computeCarrierCapacity` (ADR-3) — no capacity
   * query logic lives here. Throughput follows the same shape: the
   * repository is queried UNFILTERED by date (`list({status:'delivered'})`),
   * and the optional `[from,to]` window is applied entirely inside the pure
   * fold `computeCarrierThroughput` — design §4/§6 pin the repository call
   * to carry no date filter, so the window can never silently diverge
   * between a DB-side and a domain-side reading of "delivered in range".
   */
  async getCarrierCapacity(window?: CapacityWindow): Promise<CarrierCapacityResponseDto> {
    const [carriers, openAssignments, deliveredAssignments, ordersAwaitingCarrier] = await Promise.all([
      this.carrierRepository.list({ activeOnly: true }),
      this.assignmentRepository.list({ status: 'in_transit' }),
      this.assignmentRepository.list({ status: 'delivered' }),
      this.assignmentRepository.countOrdersAwaitingCarrier(),
    ]);

    const capacity = computeCarrierCapacity(carriers, openAssignments);
    const throughput = computeCarrierThroughput(deliveredAssignments, window);

    return {
      carriers: capacity.carriers.map((row) => ({
        carrierId: row.carrierId,
        carrierName: row.carrierName,
        busy: row.busy,
        inTransitCount: row.inTransitCount,
        deliveredCount: throughput.get(row.carrierId) ?? 0,
      })),
      busyCount: capacity.busyCount,
      freeCount: capacity.freeCount,
      ordersAwaitingCarrier,
    };
  }

  private toCarrierResponse(carrier: DomainCarrier, coversWarehouse?: boolean): CarrierResponseDto {
    return {
      id: carrier.id,
      name: carrier.name,
      phone: carrier.phone,
      active: carrier.active,
      ...(coversWarehouse !== undefined ? { coversWarehouse } : {}),
      createdAt: carrier.createdAt.toISOString(),
      updatedAt: carrier.updatedAt.toISOString(),
    };
  }

  private toAssignmentResponse(assignment: DomainDeliveryAssignment): DeliveryAssignmentResponseDto {
    return {
      id: assignment.id,
      orderId: assignment.orderId,
      carrierId: assignment.carrierId,
      status: assignment.status,
      assignedAt: assignment.assignedAt.toISOString(),
      deliveredAt: assignment.deliveredAt ? assignment.deliveredAt.toISOString() : null,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    };
  }
}
