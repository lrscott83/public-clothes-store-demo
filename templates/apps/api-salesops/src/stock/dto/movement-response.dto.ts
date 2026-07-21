import type { StockLevelResponseDto } from './stock-level-response.dto.js';

/**
 * Response shape for `POST /stock/movements` — the recorded movement plus
 * the resulting `StockLevel` (post-mutation), per design.md's transactional
 * flow.
 */
export class MovementResponseDto {
  id!: string;
  productId!: string;
  warehouseId!: string;
  type!: string;
  reason!: string | null;
  quantity!: string;
  createdAt!: string;
  createdBy!: string | null;
  stockLevel!: StockLevelResponseDto;
}
