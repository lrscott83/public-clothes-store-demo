import { Module } from '@nestjs/common';
import { CATEGORY_REPOSITORY, PRODUCT_REPOSITORY } from '@store-mgmt/domain';
import { InfraDbModule, PrismaCategoryRepository, PrismaProductRepository } from '@store-mgmt/infra-db';
import { InfraStorageModule } from '@store-mgmt/infra-storage';
import { ProductController } from './product.controller.js';
import { ProductService } from './product.service.js';

@Module({
  imports: [InfraDbModule, InfraStorageModule],
  controllers: [ProductController],
  providers: [
    ProductService,
    { provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository },
    // ProductService also validates `categoryId` existence before create/update.
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
  ],
})
export class ProductModule {}
