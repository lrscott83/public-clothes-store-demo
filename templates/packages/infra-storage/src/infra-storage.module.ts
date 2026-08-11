import { Module } from '@nestjs/common';
import { PRODUCT_IMAGE_STORE } from '@store-mgmt/domain';
import { FsProductImageStore } from './product-image/fs-product-image.store.js';

/**
 * Binds the concrete adapter to the domain's `PRODUCT_IMAGE_STORE` token
 * (design.md D1, file map). Unlike `InfraDbModule` — which exports concrete
 * services for each consumer app to bind against its OWN abstract token —
 * this module owns the binding itself: both `api-public` and `api-salesops`
 * import `InfraStorageModule` and inject `PRODUCT_IMAGE_STORE` directly, with
 * no per-app rebinding. There is exactly one adapter for this port today.
 */
@Module({
  providers: [{ provide: PRODUCT_IMAGE_STORE, useClass: FsProductImageStore }],
  exports: [PRODUCT_IMAGE_STORE],
})
export class InfraStorageModule {}
