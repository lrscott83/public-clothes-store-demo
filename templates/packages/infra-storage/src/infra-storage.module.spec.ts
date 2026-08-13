import { Test } from '@nestjs/testing';
import { IMAGE_STORE, type IImageStore } from '@store-mgmt/domain';
import { InfraStorageModule } from './infra-storage.module.js';
import { FsImageStore } from './image/fs-image.store.js';

describe('InfraStorageModule', () => {
  it('binds IMAGE_STORE to the filesystem adapter', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [InfraStorageModule],
    }).compile();

    const store = moduleRef.get<IImageStore>(IMAGE_STORE);

    expect(store).toBeInstanceOf(FsImageStore);
  });
});
