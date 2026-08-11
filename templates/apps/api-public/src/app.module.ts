import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PublicCategoryModule } from './category/public-category.module.js';
import { HealthModule } from './health/health.module.js';
import { PublicProductModule } from './product/public-product.module.js';
import { StoreModule } from './store/store.module.js';
import { PublicTenantModule } from './tenant/public-tenant.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PublicTenantModule,
    HealthModule,
    StoreModule,
    PublicCategoryModule,
    PublicProductModule,
  ],
})
export class AppModule {}
