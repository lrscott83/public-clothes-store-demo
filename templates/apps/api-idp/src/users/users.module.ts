import { Module } from '@nestjs/common';
import { USER_REPOSITORY } from '@store-mgmt/domain';
import { InfraDbModule, PrismaUserRepository } from '@store-mgmt/infra-db';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [InfraDbModule],
  controllers: [UsersController],
  providers: [UsersService, { provide: USER_REPOSITORY, useClass: PrismaUserRepository }],
})
export class UsersModule {}
