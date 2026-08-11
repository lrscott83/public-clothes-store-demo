import { Module } from '@nestjs/common';
import { CATEGORY_REPOSITORY, PRODUCT_REPOSITORY } from '@store-mgmt/domain';
import { InfraDbModule, PrismaCategoryRepository, PrismaProductRepository } from '@store-mgmt/infra-db';
import { PublicProductController } from './public-product.controller.js';
import { PublicProductService } from './public-product.service.js';

@Module({
  imports: [InfraDbModule],
  controllers: [PublicProductController],
  providers: [
    PublicProductService,
    { provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository },
    // `PublicProductController` also resolves `categorySlug` per item.
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
  ],
})
export class PublicProductModule {}
