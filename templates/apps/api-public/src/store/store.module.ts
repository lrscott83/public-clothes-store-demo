import { Module } from '@nestjs/common';
import { StoreController } from './store.controller.js';

/** `COMPANY_REPOSITORY` comes from the `@Global()` `PublicTenantModule` — not redeclared here. */
@Module({ controllers: [StoreController] })
export class StoreModule {}
