import { Module } from '@nestjs/common';
import { IMAGE_STORE } from '@store-mgmt/domain';
import { FsImageStore } from './image/fs-image.store.js';

/**
 * Binds the concrete adapter to the domain's `IMAGE_STORE` token (design.md
 * D1). Unlike `InfraDbModule` — which exports concrete services for each
 * consumer app to bind against its OWN abstract token — this module owns the
 * binding itself: both `api-public` and `api-salesops` import
 * `InfraStorageModule` and inject `IMAGE_STORE` directly, with no per-app
 * rebinding. There is exactly one adapter for this port today, and it now
 * serves both the products and the categories collections.
 */
@Module({
  providers: [{ provide: IMAGE_STORE, useClass: FsImageStore }],
  exports: [IMAGE_STORE],
})
export class InfraStorageModule {}
