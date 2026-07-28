import { Inject, Injectable } from '@nestjs/common';
import {
  STOCK_LEVEL_REPOSITORY,
  WAREHOUSE_REPOSITORY,
  eligibleWarehouses,
  type BasketLine,
  type IStockLevelRepository,
  type IWarehouseRepository,
  type StockLevel,
  type Warehouse,
} from '@store-mgmt/domain';

/**
 * Answers "which warehouses can fulfil this basket on their own?" — the read
 * a sales agent needs before choosing one (D3). The agent is bound to no
 * warehouse (D2), so this NEVER narrows the candidate set by caller: every
 * active warehouse is considered, and scoping is not this service's concern.
 *
 * The eligibility rule itself lives in the domain (`sales/availability.ts`);
 * this service only gathers the snapshot and hands it over — the same shape
 * `OrderService` already uses to feed `createOrder` its `ExchangeRate[]`.
 */
@Injectable()
export class AvailabilityService {
  constructor(
    @Inject(STOCK_LEVEL_REPOSITORY) private readonly stockLevelRepository: IStockLevelRepository,
    @Inject(WAREHOUSE_REPOSITORY) private readonly warehouseRepository: IWarehouseRepository,
  ) {}

  async eligibleWarehousesFor(basket: readonly BasketLine[]): Promise<Warehouse[]> {
    const warehouses = await this.warehouseRepository.list();
    const levels = await this.fetchStockLevels(basket);
    const eligibleIds = new Set(
      eligibleWarehouses(
        basket,
        warehouses.map((w) => w.id),
        levels,
      ),
    );

    return warehouses.filter((w) => eligibleIds.has(w.id));
  }

  /**
   * `IStockLevelRepository.list`'s filter is SINGULAR (`productId?`), so a
   * basket needs a fan-out — mirrors `OrderService.fetchAllRates`. Deduped
   * first: two lines of the same product must not cost two queries.
   */
  private async fetchStockLevels(basket: readonly BasketLine[]): Promise<StockLevel[]> {
    const productIds = [...new Set(basket.map((line) => line.productId))];
    const perProduct = await Promise.all(
      productIds.map((productId) => this.stockLevelRepository.list({ productId })),
    );

    return perProduct.flat();
  }
}
