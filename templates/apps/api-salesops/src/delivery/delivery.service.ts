import { Inject, Injectable } from '@nestjs/common';
import type {
  Carrier as DomainCarrier,
  CarrierUpdateInput,
  DeliveryAssignment as DomainDeliveryAssignment,
  DeliveryAssignmentFilter,
  ICarrierRepository,
  ICarrierWarehouseRepository,
  IDeliveryAssignmentRepository,
} from '@store-mgmt/domain';
import {
  CARRIER_REPOSITORY,
  CARRIER_WAREHOUSE_REPOSITORY,
  CarrierNotFoundError,
  DELIVERY_ASSIGNMENT_REPOSITORY,
  OrderAlreadyAssignedError,
  assignCarrier,
  computeCarrierCapacity,
  computeCarrierThroughput,
} from '@store-mgmt/domain';
import type {
  AssignCarrierDto,
  CarrierCapacityResponseDto,
  CarrierResponseDto,
  CreateCarrierDto,
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
 * Orchestration layer for the Delivery module (design §6). Phase 4 shipped
 * the read surface; Phase 6 (this) adds Carrier CRUD writes and `assign`.
 * `markDelivered` is NOT here — that needs `IOrderDeliveryGateway` /
 * `SalesModule`, which is Phase 6b (out of scope for this batch; see
 * `delivery.module.ts`, still `imports: [InfraDbModule]` only). Mirrors
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

  /**
   * Unlike `WarehouseService.create`, this does NOT run the payload through a
   * domain guardian factory first — `createCarrier()` (Phase 1) defines no
   * runtime rejection (`name` is required only at the TYPE level; see its
   * doc comment). The repository is the single source of truth.
   */
  async createCarrier(input: CreateCarrierDto): Promise<CarrierResponseDto> {
    const created = await this.carrierRepository.create(input);
    return this.toCarrierResponse(created);
  }

  async updateCarrier(id: string, patch: CarrierUpdateInput): Promise<CarrierResponseDto> {
    const updated = await this.carrierRepository.update(id, patch);
    return this.toCarrierResponse(updated);
  }

  /** Soft-delete only — flips `active`, never a hard `DELETE` (spec: "Deleting a carrier soft-deletes it"). */
  async deactivateCarrier(id: string): Promise<void> {
    await this.carrierRepository.softDelete(id);
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
   * `findById` -> `findByOrderId` -> pure `assignCarrier()` -> `create()`
   * (task 6.3/6.4). Deliberately does NOT consult
   * `carrierWarehouseRepository` at all — coverage is advisory, surfaced on
   * reads only (`listCarriers`), and MUST NOT block or warn on assignment
   * (spec: "Coverage Is Advisory, Not an Enforced Assignment Block"; ADR-4).
   * `CarrierNotFoundError` covers BOTH an unknown id and an inactive
   * carrier — same 404 either way, mirroring the error's own message.
   */
  async assign(input: AssignCarrierDto): Promise<DeliveryAssignmentResponseDto> {
    const carrier = await this.carrierRepository.findById(input.carrierId);
    if (!carrier || !carrier.active) {
      throw new CarrierNotFoundError(input.carrierId);
    }

    const existing = await this.assignmentRepository.findByOrderId(input.orderId);
    if (existing) {
      throw new OrderAlreadyAssignedError(input.orderId);
    }

    const created = await this.assignmentRepository.create(
      assignCarrier({ orderId: input.orderId, carrierId: input.carrierId }, new Date()),
    );
    return this.toAssignmentResponse(created);
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
