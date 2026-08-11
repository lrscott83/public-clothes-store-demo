export { InfraStorageModule } from './infra-storage.module.js';
export {
  FsProductImageStore,
  UnsupportedProductImageMimeTypeError,
} from './product-image/fs-product-image.store.js';
export {
  normalizeImage,
  UnsupportedImageError,
  type NormalizedImage,
} from './product-image/normalize-image.js';
