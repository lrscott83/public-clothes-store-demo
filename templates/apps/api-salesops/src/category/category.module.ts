import { Module } from '@nestjs/common';
import { CATEGORY_REPOSITORY } from '@store-mgmt/domain';
import { InfraDbModule, PrismaCategoryRepository } from '@store-mgmt/infra-db';
import { CategoryController } from './category.controller.js';
import { CategoryService } from './category.service.js';

@Module({
  imports: [InfraDbModule],
  controllers: [CategoryController],
  providers: [
    CategoryService,
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
  ],
})
export class CategoryModule {}
