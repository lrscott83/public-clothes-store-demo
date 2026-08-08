import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InfraDbModule } from '@store-mgmt/infra-db';
import { AuthModule } from '../auth/auth.module.js';
import { CompanyModule } from '../company/company.module.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), InfraDbModule, AuthModule, UsersModule, CompanyModule],
})
export class AppModule {}
