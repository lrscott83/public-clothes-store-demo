import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InfraDbModule } from '@store-mgmt/infra-db';
import { AuthModule } from './auth/auth.module.js';
import { CategoryModule } from './category/category.module.js';
import { CurrencyModule } from './currency/currency.module.js';
import { CustomerModule } from './customer/customer.module.js';
import { HealthModule } from './health/health.module.js';
import { ProductModule } from './product/product.module.js';
import { StockModule } from './stock/stock.module.js';
import { VentasModule } from './ventas/ventas.module.js';
import { WarehouseModule } from './warehouse/warehouse.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    InfraDbModule,
    AuthModule,
    HealthModule,
    CurrencyModule,
    CategoryModule,
    ProductModule,
    WarehouseModule,
    StockModule,
    CustomerModule,
    VentasModule,
  ],
})
export class AppModule {}
