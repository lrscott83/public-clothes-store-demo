import { Inject, Injectable } from '@nestjs/common';
import type { IWarehouseRepository, Warehouse as DomainWarehouse } from '@store-mgmt/domain';
import { WAREHOUSE_REPOSITORY } from '@store-mgmt/domain';
import type { CreateWarehouseDto, UpdateWarehouseDto, WarehouseResponseDto } from './dto/index.js';

/**
 * Orchestration layer for warehouses: the only place with I/O (via
 * `WAREHOUSE_REPOSITORY`). Maps the domain `Warehouse` to the API's
 * `WarehouseResponseDto` (dates -> ISO strings). Mirrors `CategoryService`.
 */
@Injectable()
export class WarehouseService {
  constructor(
    @Inject(WAREHOUSE_REPOSITORY) private readonly warehouseRepository: IWarehouseRepository,
  ) {}

  async create(input: CreateWarehouseDto): Promise<WarehouseResponseDto> {
    const created = await this.warehouseRepository.create(input);
    return this.toResponse(created);
  }

  async update(id: string, patch: UpdateWarehouseDto): Promise<WarehouseResponseDto> {
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
