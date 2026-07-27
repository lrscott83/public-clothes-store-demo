import { Module } from '@nestjs/common';
import { COMPANY_USER_REPOSITORY, USER_REPOSITORY } from '@store-mgmt/domain';
import { InfraDbModule, PrismaCompanyUserRepository, PrismaUserRepository } from '@store-mgmt/infra-db';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [InfraDbModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: COMPANY_USER_REPOSITORY, useClass: PrismaCompanyUserRepository },
  ],
})
export class UsersModule {}
