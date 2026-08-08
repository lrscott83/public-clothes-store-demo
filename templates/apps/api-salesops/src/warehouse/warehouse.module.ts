import { Module } from '@nestjs/common';
import { WAREHOUSE_REPOSITORY } from '@store-mgmt/domain';
import { InfraDbModule, PrismaWarehouseRepository } from '@store-mgmt/infra-db';
import { WarehouseController } from './warehouse.controller.js';
import { WarehouseService } from './warehouse.service.js';

@Module({
  imports: [InfraDbModule],
  controllers: [WarehouseController],
  providers: [
    WarehouseService,
    { provide: WAREHOUSE_REPOSITORY, useClass: PrismaWarehouseRepository },
  ],
})
export class WarehouseModule {}
