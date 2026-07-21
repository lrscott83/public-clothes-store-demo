import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { InvalidStockMovementError, NegativeStockError } from '@store-mgmt/domain';
import { StockService } from './stock.service.js';
import type { MovementResponseDto, RecordMovementDto, StockLevelResponseDto } from './dto/index.js';

/** The closed `StockMovementType` union, mirrored here for boundary validation. */
const VALID_MOVEMENT_TYPES = new Set<string>([
  'purchase_in',
  'sale_out',
  'transfer_in',
  'transfer_out',
  'adjustment_in',
  'adjustment_out',
]);

/**
 * REST delivery for the Stock module. `GET /stock` reads a `StockLevel`
 * (derived `available` as a string, all-zero when the pair has no row yet).
 * `POST /stock/movements` runs the atomic onHand-mutation flow. Validates
 * `type` against the closed union at the boundary (mirrors `assertCurrency`
 * in `ProductController`); maps `InvalidStockMovementError`/
 * `NegativeStockError` -> 400.
 */
@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  async getLevel(
    @Query('productId') productId: string,
    @Query('warehouseId') warehouseId: string,
  ): Promise<StockLevelResponseDto> {
    return this.stockService.getLevel(productId, warehouseId);
  }

  @Post('movements')
  @HttpCode(HttpStatus.CREATED)
  async recordMovement(@Body() body: RecordMovementDto): Promise<MovementResponseDto> {
    if (!VALID_MOVEMENT_TYPES.has(body.type)) {
      throw new BadRequestException(`Unknown movement type: "${body.type}"`);
    }
    return this.withDomainErrorMapping(() => this.stockService.recordMovement(body));
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidStockMovementError || err instanceof NegativeStockError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
