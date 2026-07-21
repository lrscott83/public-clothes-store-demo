import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateStockMovementInput,
  IProductRepository,
  IStockLevelRepository,
  IStockMovementRepository,
  RecordMovementResult,
  StockLevel as DomainStockLevel,
  StockMovementType,
} from '@store-mgmt/domain';
import {
  InvalidStockMovementError,
  PRODUCT_REPOSITORY,
  STOCK_LEVEL_REPOSITORY,
  STOCK_MOVEMENT_REPOSITORY,
  availableStock,
  createStockMovement,
} from '@store-mgmt/domain';
import type { MovementResponseDto, RecordMovementDto, StockLevelResponseDto } from './dto/index.js';

/** A missing StockLevel row means zero stock — never a persisted row. */
const ZERO_LEVEL = { onHand: 0, reserved: 0 };

/**
 * Orchestration layer for stock reads + the movement-recording flow.
 * `getLevel` resolves a missing `(productId, warehouseId)` pair to
 * all-zero, never an error (StockLevel rows are lazily created on first
 * movement). `recordMovement` validates the referenced `productId` exists
 * via `PRODUCT_REPOSITORY` BEFORE calling `IStockMovementRepository.record`
 * (mirrors `ProductService`'s `categoryId` validation — per design.md,
 * product-existence validation lives here, the cross-table atomic mutation
 * lives in the repository). Also re-validates `quantity`/`type` through the
 * pure domain `createStockMovement` guard before ever reaching the
 * transaction. `createdBy` is always `null` — no auth module yet.
 */
@Injectable()
export class StockService {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly productRepository: IProductRepository,
    @Inject(STOCK_LEVEL_REPOSITORY) private readonly stockLevelRepository: IStockLevelRepository,
    @Inject(STOCK_MOVEMENT_REPOSITORY) private readonly stockMovementRepository: IStockMovementRepository,
  ) {}

  async getLevel(productId: string, warehouseId: string): Promise<StockLevelResponseDto> {
    const level = await this.stockLevelRepository.findByProductAndWarehouse(productId, warehouseId);
    if (!level) {
      return this.toLevelResponse(productId, warehouseId, ZERO_LEVEL);
    }
    return this.toLevelResponse(productId, warehouseId, level);
  }

  async recordMovement(input: RecordMovementDto): Promise<MovementResponseDto> {
    const product = await this.productRepository.findById(input.productId);
    if (!product) {
      throw new InvalidStockMovementError(`Product "${input.productId}" does not exist`);
    }

    const quantity = Number(input.quantity);
    // Reuses the pure domain guard (quantity > 0, integer) — same
    // "grita, no adivina" discipline as every other domain invariant.
    const validated = createStockMovement({
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: input.type as StockMovementType,
      quantity,
      reason: input.reason ?? null,
      createdBy: null, // no auth module yet — see design.md decision #11
    });

    const recordInput: CreateStockMovementInput = {
      productId: validated.productId,
      warehouseId: validated.warehouseId,
      type: validated.type,
      quantity: validated.quantity,
      reason: validated.reason,
      createdBy: validated.createdBy,
    };

    const result = await this.stockMovementRepository.record(recordInput);
    return this.toMovementResponse(result);
  }

  private toLevelResponse(
    productId: string,
    warehouseId: string,
    level: { onHand: number; reserved: number },
  ): StockLevelResponseDto {
    return {
      productId,
      warehouseId,
      onHand: String(level.onHand),
      reserved: String(level.reserved),
      available: String(level.onHand - level.reserved),
    };
  }

  private toMovementResponse(result: RecordMovementResult): MovementResponseDto {
    return {
      id: result.movement.id,
      productId: result.movement.productId,
      warehouseId: result.movement.warehouseId,
      type: result.movement.type,
      reason: result.movement.reason,
      quantity: String(result.movement.quantity),
      createdAt: result.movement.createdAt.toISOString(),
      createdBy: result.movement.createdBy ?? null,
      stockLevel: this.toDerivedLevelResponse(result.stockLevel),
    };
  }

  private toDerivedLevelResponse(level: DomainStockLevel): StockLevelResponseDto {
    return {
      productId: level.productId,
      warehouseId: level.warehouseId,
      onHand: String(level.onHand),
      reserved: String(level.reserved),
      available: String(availableStock(level)),
    };
  }
}
