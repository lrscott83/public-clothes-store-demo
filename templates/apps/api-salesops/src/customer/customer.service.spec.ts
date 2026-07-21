import { Test, TestingModule } from '@nestjs/testing';
import type { Customer as DomainCustomer, ICustomerRepository } from '@store-mgmt/domain';
import { CUSTOMER_REPOSITORY, InvalidCustomerError } from '@store-mgmt/domain';
import { CustomerService } from './customer.service.js';

function buildRepoMock(): jest.Mocked<ICustomerRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
  };
}

const sampleCustomer: DomainCustomer = {
  id: 'customer-uuid-1',
  fullName: 'Ana Torres',
  documentId: null,
  cellPhone: null,
  email: null,
  address: null,
  note: null,
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('CustomerService', () => {
  let service: CustomerService;
  let repo: jest.Mocked<ICustomerRepository>;

  beforeEach(async () => {
    repo = buildRepoMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomerService, { provide: CUSTOMER_REPOSITORY, useValue: repo }],
    }).compile();
    service = module.get(CustomerService);
  });

  describe('create', () => {
    it('creates a customer and maps it to a response DTO, dates -> ISO strings, nulls kept', async () => {
      repo.create.mockResolvedValue(sampleCustomer);

      const result = await service.create({ fullName: 'Ana Torres' });

      expect(result).toEqual({
        id: 'customer-uuid-1',
        fullName: 'Ana Torres',
        documentId: null,
        cellPhone: null,
        email: null,
        address: null,
        note: null,
        active: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });

    // Real invariant check — does NOT mock the repository to reject; it
    // exercises the actual `createCustomer()` domain guard wired into the
    // service. Proves the repository is never even called, unlike the
    // pre-fix bypass where nothing in the real path stopped an empty name.
    it('throws InvalidCustomerError for an empty fullName WITHOUT reaching the repository', async () => {
      await expect(service.create({ fullName: '' })).rejects.toThrow(InvalidCustomerError);

      expect(repo.create).not.toHaveBeenCalled();
    });

    it('throws InvalidCustomerError for a whitespace-only fullName WITHOUT reaching the repository', async () => {
      await expect(service.create({ fullName: '   ' })).rejects.toThrow(InvalidCustomerError);

      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates a customer and maps it to a response DTO', async () => {
      repo.update.mockResolvedValue({ ...sampleCustomer, cellPhone: '555-1234' });

      const result = await service.update('customer-uuid-1', { cellPhone: '555-1234' });

      expect(result.cellPhone).toBe('555-1234');
      expect(repo.update).toHaveBeenCalledWith('customer-uuid-1', { cellPhone: '555-1234' });
    });

    it('throws InvalidCustomerError when clearing fullName to empty, WITHOUT reaching the repository', async () => {
      await expect(service.update('customer-uuid-1', { fullName: '' })).rejects.toThrow(
        InvalidCustomerError,
      );

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('does not validate fullName when the patch omits it', async () => {
      repo.update.mockResolvedValue({ ...sampleCustomer, cellPhone: '555-1234' });

      await service.update('customer-uuid-1', { cellPhone: '555-1234' });

      expect(repo.update).toHaveBeenCalledWith('customer-uuid-1', { cellPhone: '555-1234' });
    });
  });

  describe('softDelete', () => {
    it('delegates to the repository softDelete', async () => {
      await service.softDelete('customer-uuid-1');
      expect(repo.softDelete).toHaveBeenCalledWith('customer-uuid-1');
    });
  });

  describe('findById', () => {
    it('maps the found row to a response DTO', async () => {
      repo.findById.mockResolvedValue(sampleCustomer);

      const result = await service.findById('customer-uuid-1');

      expect(result?.fullName).toBe('Ana Torres');
    });

    it('returns null when not found', async () => {
      repo.findById.mockResolvedValue(null);

      const result = await service.findById('unknown-id');

      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('maps every repository row to a response DTO', async () => {
      repo.list.mockResolvedValue([sampleCustomer]);

      const result = await service.list();

      expect(result).toHaveLength(1);
      expect(result[0]?.fullName).toBe('Ana Torres');
    });
  });
});
