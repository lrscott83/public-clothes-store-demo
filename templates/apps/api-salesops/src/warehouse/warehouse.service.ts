import { Inject, Injectable } from '@nestjs/common';
import type { IWarehouseRepository, Warehouse as DomainWarehouse } from '@store-mgmt/domain';
import { WAREHOUSE_REPOSITORY, createWarehouse } from '@store-mgmt/domain';
import type { CreateWarehouseDto, UpdateWarehouseDto, WarehouseResponseDto } from './dto/index.js';

/**
 * Orchestration layer for warehouses: the only place with I/O (via
 * `WAREHOUSE_REPOSITORY`). Maps the domain `Warehouse` to the API's
 * `WarehouseResponseDto` (dates -> ISO strings). Mirrors `CategoryService`.
 *
 * `create`/`update` run the payload through the domain guardian
 * `createWarehouse()` BEFORE delegating to the repository — this is the only
 * place `InvalidWarehouseError` can genuinely fire on the real HTTP path (the
 * repository/Prisma layer has no notion of the invariant, by design). The
 * built `Warehouse` from `createWarehouse()` is discarded — the repository/DB
 * remains the single source of truth for `id`/`createdAt` — it is called
 * purely to enforce "non-empty, non-whitespace name, scream not guess".
 */
@Injectable()
export class WarehouseService {
  constructor(
    @Inject(WAREHOUSE_REPOSITORY) private readonly warehouseRepository: IWarehouseRepository,
  ) {}

  async create(input: CreateWarehouseDto): Promise<WarehouseResponseDto> {
    createWarehouse(input);
    const created = await this.warehouseRepository.create(input);
    return this.toResponse(created);
  }

  async update(id: string, patch: UpdateWarehouseDto): Promise<WarehouseResponseDto> {
    if (patch.name !== undefined) {
      createWarehouse({ ...patch, name: patch.name });
    }
    const updated = await this.warehouseRepository.update(id, patch);
    return this.toResponse(updated);
  }

  async softDelete(id: string): Promise<void> {
    await this.warehouseRepository.softDelete(id);
  }

  async findById(id: string): Promise<WarehouseResponseDto | null> {
    const found = await this.warehouseRepository.findById(id);
    return found ? this.toResponse(found) : null;
  }

  async list(includeInactive = false): Promise<WarehouseResponseDto[]> {
    const rows = await this.warehouseRepository.list({ includeInactive });
    return rows.map((row) => this.toResponse(row));
  }

  private toResponse(warehouse: DomainWarehouse): WarehouseResponseDto {
    return {
      id: warehouse.id,
      name: warehouse.name,
      active: warehouse.active,
      createdAt: warehouse.createdAt.toISOString(),
      updatedAt: warehouse.updatedAt.toISOString(),
    };
  }
}
