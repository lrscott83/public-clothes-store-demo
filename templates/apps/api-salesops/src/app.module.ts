import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InfraDbModule } from '@store-mgmt/infra-db';
import { CategoryModule } from './category/category.module.js';
import { CurrencyModule } from './currency/currency.module.js';
import { HealthModule } from './health/health.module.js';
import { ProductModule } from './product/product.module.js';
import { StockModule } from './stock/stock.module.js';
import { WarehouseModule } from './warehouse/warehouse.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    InfraDbModule,
    HealthModule,
    CurrencyModule,
    CategoryModule,
    ProductModule,
    WarehouseModule,
    StockModule,
  ],
})
export class AppModule {}
