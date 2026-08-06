import { Injectable } from '@nestjs/common';
import type {
  DeliveryAssignment as DomainDeliveryAssignment,
  DeliveryAssignmentFilter,
  DeliveryAssignmentStatus,
  IDeliveryAssignmentRepository,
} from '@store-mgmt/domain';
import { Prisma } from '../../generated/tenant/client.js';
import { TenantContextService } from '../tenant/tenant-context.service.js';

/** Shape of every row Prisma returns for the `DeliveryAssignment` model. */
interface DeliveryAssignmentRow {
  readonly id: string;
  readonly orderId: string;
  readonly carrierId: string;
  readonly status: DeliveryAssignmentStatus;
  readonly assignedAt: Date;
  readonly deliveredAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function toDomain(row: DeliveryAssignmentRow): DomainDeliveryAssignment {
  return {
    id: row.id,
    orderId: row.orderId,
    carrierId: row.carrierId,
    status: row.status,
    assignedAt: row.assignedAt,
    deliveredAt: row.deliveredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Prisma adapter for `IDeliveryAssignmentRepository`. `create` writes the
 * already-built entity verbatim (mirrors `PrismaOrderRepository.create` —
 * `assignCarrier()` already minted the id/status/assignedAt) and lets the
 * `order_id` UNIQUE index reject a duplicate straight through, uncaught
 * (design §4/§8, spec: "the UNIQUE index IS the guarantee").
 *
 * There is deliberately NO `markDelivered` here — see the port's own doc
 * comment. The delivered edge has exactly one writer,
 * `closeAssignmentOnDeliveryTx` (Phase 5).
 *
 * `countOrdersAwaitingCarrier` is a raw-SQL anti-join against `sales_order`
 * LEFT JOIN `delivery_assignment` (design §4/§9 — `"order"` is a reserved
 * word, `Order` maps to `sales_order`). Raw SQL here resolves against the
 * tenant schema because `TenantPrismaFactory` sets `search_path` on the
 * underlying connection itself (design.md §4) — the same reason
 * `applyReservationTx`'s raw `$executeRaw` needs no schema qualification.
 *
 * Client source: `TenantContextService.getClient()` (design.md D2/D5) —
 * resolved fresh per call, never cached on `this`.
 */
@Injectable()
export class PrismaDeliveryAssignmentRepository implements IDeliveryAssignmentRepository {
  constructor(private readonly tenantContext: TenantContextService) {}

  async create(assignment: DomainDeliveryAssignment): Promise<DomainDeliveryAssignment> {
    const row = await this.tenantContext.getClient().deliveryAssignment.create({
      data: {
        id: assignment.id,
        orderId: assignment.orderId,
        carrierId: assignment.carrierId,
        status: assignment.status,
        assignedAt: assignment.assignedAt,
        deliveredAt: assignment.deliveredAt,
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
      },
    });
    return toDomain(row);
  }

  async findById(id: string): Promise<DomainDeliveryAssignment | null> {
    const row = await this.tenantContext.getClient().deliveryAssignment.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByOrderId(orderId: string): Promise<DomainDeliveryAssignment | null> {
    const row = await this.tenantContext.getClient().deliveryAssignment.findUnique({ where: { orderId } });
    return row ? toDomain(row) : null;
  }

  async list(filter?: DeliveryAssignmentFilter): Promise<DomainDeliveryAssignment[]> {
    const rows = await this.tenantContext.getClient().deliveryAssignment.findMany({
      where: {
        ...(filter?.carrierId !== undefined ? { carrierId: filter.carrierId } : {}),
        ...(filter?.status !== undefined ? { status: filter.status } : {}),
        ...(filter?.deliveredFrom !== undefined || filter?.deliveredTo !== undefined
          ? {
              deliveredAt: {
                ...(filter?.deliveredFrom !== undefined ? { gte: filter.deliveredFrom } : {}),
                ...(filter?.deliveredTo !== undefined ? { lte: filter.deliveredTo } : {}),
              },
            }
          : {}),
      },
      orderBy: { assignedAt: 'desc' },
    });
    return rows.map(toDomain);
  }

  async countOrdersAwaitingCarrier(): Promise<number> {
    const rows = await this.tenantContext.getClient().$queryRaw<{ count: number }[]>(
      Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "sales_order" so
        LEFT JOIN "delivery_assignment" da ON da."order_id" = so."id"
        WHERE so."status" = 'verified'
          AND so."delivery_mode" = 'delivery'
          AND da."id" IS NULL
      `,
    );
    return rows[0]?.count ?? 0;
  }
}
