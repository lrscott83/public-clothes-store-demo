import { Module } from '@nestjs/common';
import { PrismaService } from './prisma-client.js';

@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class InfraDbModule {}
