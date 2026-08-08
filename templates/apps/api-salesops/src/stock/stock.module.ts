import { Module } from '@nestjs/common';
import {
  PRODUCT_REPOSITORY,
  STOCK_LEVEL_REPOSITORY,
  STOCK_MOVEMENT_REPOSITORY,
  WAREHOUSE_OPERATOR_REPOSITORY,
} from '@store-mgmt/domain';
import {
  InfraDbModule,
  PrismaProductRepository,
  PrismaStockLevelRepository,
  PrismaStockMovementRepository,
  PrismaWarehouseOperatorRepository,
} from '@store-mgmt/infra-db';
import { StockController } from './stock.controller.js';
import { StockService } from './stock.service.js';

@Module({
  imports: [InfraDbModule],
  controllers: [StockController],
  providers: [
    StockService,
    { provide: STOCK_LEVEL_REPOSITORY, useClass: PrismaStockLevelRepository },
    { provide: STOCK_MOVEMENT_REPOSITORY, useClass: PrismaStockMovementRepository },
    // StockService also validates `productId` existence before recording a movement.
    { provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository },
    // `StockController` uses this to enforce the `warehouse_operator` scope (backend-users-roles).
    { provide: WAREHOUSE_OPERATOR_REPOSITORY, useClass: PrismaWarehouseOperatorRepository },
  ],
})
export class StockModule {}
