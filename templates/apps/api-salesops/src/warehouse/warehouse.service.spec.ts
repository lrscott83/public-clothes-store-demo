import { Test, TestingModule } from '@nestjs/testing';
import type { IWarehouseRepository, Warehouse as DomainWarehouse } from '@store-mgmt/domain';
import { InvalidWarehouseError, WAREHOUSE_REPOSITORY } from '@store-mgmt/domain';
import { WarehouseService } from './warehouse.service.js';

function buildRepoMock(): jest.Mocked<IWarehouseRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
  };
}

const sampleWarehouse: DomainWarehouse = {
  id: 'warehouse-uuid-1',
  name: 'Pinar del Río',
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('WarehouseService', () => {
  let service: WarehouseService;
  let repo: jest.Mocked<IWarehouseRepository>;

  beforeEach(async () => {
    repo = buildRepoMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [WarehouseService, { provide: WAREHOUSE_REPOSITORY, useValue: repo }],
    }).compile();
    service = module.get(WarehouseService);
  });

  describe('create', () => {
    it('creates a warehouse and maps it to a response DTO', async () => {
      repo.create.mockResolvedValue(sampleWarehouse);

      const result = await service.create({ name: 'Pinar del Río' });

      expect(result).toEqual({
        id: 'warehouse-uuid-1',
        name: 'Pinar del Río',
        active: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    // Real invariant check — does NOT mock the repository to reject; it
    // exercises the actual `createWarehouse()` domain guard wired into the
    // service. Proves the repository is never even called, unlike the
    // pre-fix bypass where nothing in the real path stopped an empty name.
    it('throws InvalidWarehouseError for an empty name WITHOUT reaching the repository', async () => {
      await expect(service.create({ name: '' })).rejects.toThrow(InvalidWarehouseError);

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws InvalidWarehouseError for a whitespace-only name WITHOUT reaching the repository', async () => {
      await expect(service.create({ name: '   ' })).rejects.toThrow(InvalidWarehouseError);

      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates a warehouse and maps it to a response DTO', async () => {
      repo.update.mockResolvedValue({ ...sampleWarehouse, name: 'Renamed' });

      const result = await service.update('warehouse-uuid-1', { name: 'Renamed' });

      expect(result.name).toBe('Renamed');
      expect(repo.update).toHaveBeenCalledWith('warehouse-uuid-1', { name: 'Renamed' });
    });

    it('throws InvalidWarehouseError when clearing name to empty, WITHOUT reaching the repository', async () => {
      await expect(service.update('warehouse-uuid-1', { name: '' })).rejects.toThrow(
        InvalidWarehouseError,
      );

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('does not validate name when the patch omits it', async () => {
      repo.update.mockResolvedValue({ ...sampleWarehouse, active: false });

      await service.update('warehouse-uuid-1', { active: false });

      expect(repo.update).toHaveBeenCalledWith('warehouse-uuid-1', { active: false });
    });
  });

  describe('softDelete', () => {
    it('delegates to the repository softDelete', async () => {
      await service.softDelete('warehouse-uuid-1');
      expect(repo.softDelete).toHaveBeenCalledWith('warehouse-uuid-1');
    });
  });

  describe('findById', () => {
    it('maps the found row to a response DTO', async () => {
      repo.findById.mockResolvedValue(sampleWarehouse);

      const result = await service.findById('warehouse-uuid-1');

      expect(result?.name).toBe('Pinar del Río');
    });

    it('returns null when not found', async () => {
      repo.findById.mockResolvedValue(null);

      const result = await service.findById('unknown-id');

      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('maps every repository row to a response DTO', async () => {
      repo.list.mockResolvedValue([sampleWarehouse]);

      const result = await service.list();

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Pinar del Río');
    });
  });
});
