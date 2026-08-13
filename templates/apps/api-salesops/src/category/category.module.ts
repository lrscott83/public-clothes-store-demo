import { Module } from '@nestjs/common';
import { CATEGORY_REPOSITORY } from '@store-mgmt/domain';
import { InfraDbModule, PrismaCategoryRepository } from '@store-mgmt/infra-db';
import { InfraStorageModule } from '@store-mgmt/infra-storage';
import { CategoryController } from './category.controller.js';
import { CategoryService } from './category.service.js';

@Module({
  imports: [InfraDbModule, InfraStorageModule],
  controllers: [CategoryController],
  providers: [
    CategoryService,
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
  ],
})
export class CategoryModule {}
