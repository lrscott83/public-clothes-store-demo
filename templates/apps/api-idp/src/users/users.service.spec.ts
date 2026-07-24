import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { IUserRepository, User as DomainUser } from '@store-mgmt/domain';
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
  roles: 1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function buildRepoMock(): jest.Mocked<IUserRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    findById: jest.fn(),
    findByLogin: jest.fn(),
    list: jest.fn(),
  };
}

describe('UsersService', () => {
  let repo: jest.Mocked<IUserRepository>;
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = buildRepoMock();
    service = new UsersService(repo);
  });

  describe('create', () => {
    it('hashes the password and persists an explicit roles bitmask', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue(VALID_HASH);
      repo.create.mockResolvedValue({ ...baseUser, roles: 8 });

      const result = await service.create({
        login: 'jdoe',
        password: 'plaintext',
        fullName: 'John Doe',
        roles: 8,
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('plaintext', 10);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ roles: 8 }));
      expect(result.roles).toBe(8);
    });

    it('maps a duplicate login to ConflictException', async () => {
      const { DuplicateLoginError } = jest.requireActual('@store-mgmt/domain');
      (bcrypt.hash as jest.Mock).mockResolvedValue(VALID_HASH);
      repo.create.mockRejectedValue(new DuplicateLoginError('login "jdoe" is already in use'));

      await expect(
        service.create({ login: 'jdoe', password: 'plaintext', fullName: 'John Doe' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('list', () => {
    it('maps every row, never leaking passwordHash', async () => {
      repo.list.mockResolvedValue([baseUser]);

      const result = await service.list();

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
    it('updates roles for an existing user', async () => {
      repo.findById.mockResolvedValue(baseUser);
      repo.update.mockResolvedValue({ ...baseUser, roles: 2 });

      const result = await service.update('user-1', { roles: 2 });

      expect(repo.update).toHaveBeenCalledWith('user-1', { roles: 2 });
      expect(result.roles).toBe(2);
    });

    it('throws NotFoundException for an unknown id, without calling update', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.update('ghost', { roles: 2 })).rejects.toBeInstanceOf(NotFoundException);
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
