import { Module } from '@nestjs/common';
import { CATEGORY_REPOSITORY } from '@store-mgmt/domain';
import { InfraDbModule, PrismaCategoryRepository } from '@store-mgmt/infra-db';
import { PublicCategoryController } from './public-category.controller.js';

@Module({
  imports: [InfraDbModule],
  controllers: [PublicCategoryController],
  providers: [{ provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository }],
})
export class PublicCategoryModule {}
