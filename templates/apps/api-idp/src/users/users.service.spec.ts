import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type {
  CompanyUser,
  ICompanyUserRepository,
  IUserRepository,
  User as DomainUser,
} from '@store-mgmt/domain';
import { UsersService } from './users.service.js';

jest.mock('bcrypt');

const VALID_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUV';

const baseUser: DomainUser = {
  id: 'user-1',
  login: 'jdoe',
  passwordHash: VALID_HASH,
  fullName: 'John Doe',
  email: null,
  cellPhone: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const TEST_COMPANY_ID = 'company-1';

function companyUser(role: number): CompanyUser {
  return {
    id: 'cu-1',
    userId: 'user-1',
    companyId: TEST_COMPANY_ID,
    role,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function buildRepoMock(): jest.Mocked<IUserRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    updatePassword: jest.fn(),
    findById: jest.fn(),
    findByLogin: jest.fn(),
    list: jest.fn(),
  };
}

// `create`/`updateRole` echo the role they were asked to persist: the
// assignment is now the authoritative source of the response DTO's `roles`, so
// a mock returning a fixed value would hide a service that ignored its input.
function buildCompanyUserRepoMock(): jest.Mocked<ICompanyUserRepository> {
  return {
    create: jest.fn().mockImplementation(({ role }: { role: number }) => Promise.resolve(companyUser(role))),
    findActiveByUserId: jest.fn().mockResolvedValue(companyUser(1)),
    findByUserAndCompany: jest.fn(),
    updateRole: jest.fn().mockImplementation((_u: string, _c: string, role: number) =>
      Promise.resolve(companyUser(role)),
    ),
    listByCompany: jest.fn().mockResolvedValue([companyUser(1)]),
  };
}

describe('UsersService', () => {
  let repo: jest.Mocked<IUserRepository>;
  let companyUserRepo: jest.Mocked<ICompanyUserRepository>;
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = buildRepoMock();
    companyUserRepo = buildCompanyUserRepoMock();
    service = new UsersService(repo, companyUserRepo);
  });

  describe('create', () => {
    it('hashes the password and persists the explicit bitmask on the assignment, not on the user', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue(VALID_HASH);
      repo.create.mockResolvedValue(baseUser);

      const result = await service.create(TEST_COMPANY_ID, {
        login: 'jdoe',
        password: 'plaintext',
        fullName: 'John Doe',
        roles: 8,
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('plaintext', 10);
      expect(repo.create).toHaveBeenCalledWith(expect.not.objectContaining({ roles: expect.anything() }));
      expect(companyUserRepo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 8 }));
      expect(result.roles).toBe(8);
    });

    it('maps a duplicate login to ConflictException', async () => {
      const { DuplicateLoginError } = jest.requireActual('@store-mgmt/domain');
      (bcrypt.hash as jest.Mock).mockResolvedValue(VALID_HASH);
      repo.create.mockRejectedValue(new DuplicateLoginError('login "jdoe" is already in use'));

      await expect(
        service.create(TEST_COMPANY_ID, { login: 'jdoe', password: 'plaintext', fullName: 'John Doe' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('list', () => {
    it('maps every row, never leaking passwordHash', async () => {
      repo.list.mockResolvedValue([baseUser]);

      const result = await service.list(TEST_COMPANY_ID);

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('passwordHash');
    });
  });

  describe('findById', () => {
    it('returns the mapped user', async () => {
      repo.findById.mockResolvedValue(baseUser);
      const result = await service.findById('user-1');
      expect(result.login).toBe('jdoe');
    });

    it('throws NotFoundException for an unknown id', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findById('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('routes a role change to the assignment and never to the user row', async () => {
      repo.findById.mockResolvedValue(baseUser);
      repo.update.mockResolvedValue(baseUser);

      const result = await service.update(TEST_COMPANY_ID, 'user-1', { roles: 2 });

      // The profile patch reaches `userRepository` stripped of `roles` —
      // `app_user` has no such column since migration 002.
      expect(repo.update).toHaveBeenCalledWith('user-1', {});
      expect(companyUserRepo.updateRole).toHaveBeenCalledWith('user-1', TEST_COMPANY_ID, 2);
      expect(result.roles).toBe(2);
    });

    it('throws NotFoundException for an unknown id, without calling update', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.update(TEST_COMPANY_ID, 'ghost', { roles: 2 })).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('sets isActive=false, never a hard delete', async () => {
      repo.findById.mockResolvedValue(baseUser);
      repo.update.mockResolvedValue({ ...baseUser, isActive: false });

      const result = await service.deactivate('user-1');

      expect(repo.update).toHaveBeenCalledWith('user-1', { isActive: false });
      expect(result.isActive).toBe(false);
    });

    it('throws NotFoundException for an unknown id', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.deactivate('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
