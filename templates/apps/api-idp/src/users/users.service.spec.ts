import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { IMembershipRepository, IUserRepository, Membership, User as DomainUser } from '@store-mgmt/domain';
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
const ACTOR = { companyId: TEST_COMPANY_ID, companyUserId: 'company-user-caller' };

function membership(userId: string): Membership {
  return {
    id: `membership-${userId}`,
    userId,
    companyId: TEST_COMPANY_ID,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function buildUserRepoMock(): jest.Mocked<IUserRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    updatePassword: jest.fn(),
    findById: jest.fn(),
    findByLogin: jest.fn(),
    list: jest.fn(),
  };
}

function buildMembershipRepoMock(): jest.Mocked<IMembershipRepository> {
  return {
    create: jest.fn().mockImplementation(({ userId }: { userId: string }) => Promise.resolve(membership(userId))),
    findByUserAndCompany: jest.fn(),
    listActiveByUserId: jest.fn(),
    listByCompany: jest.fn().mockResolvedValue([]),
    delete: jest.fn(),
  };
}

describe('UsersService', () => {
  let userRepo: jest.Mocked<IUserRepository>;
  let membershipRepo: jest.Mocked<IMembershipRepository>;
  let companyUserCreate: jest.Mock;
  let companyUserFindMany: jest.Mock;
  let companyUserFindUnique: jest.Mock;
  let companyUserUpdate: jest.Mock;
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    userRepo = buildUserRepoMock();
    membershipRepo = buildMembershipRepoMock();
    companyUserCreate = jest.fn().mockResolvedValue({ id: 'user-1' });
    companyUserFindMany = jest.fn().mockResolvedValue([]);
    companyUserFindUnique = jest.fn().mockResolvedValue(null);
    companyUserUpdate = jest.fn().mockResolvedValue({ id: 'user-1' });
    // `TenantContextService` stand-in: only `getClient()` is exercised here —
    // the ACTIVE scope itself is `UsersController`'s job (`runInTenant`,
    // design D5), not this service's, so `.run()` is never called from
    // inside it. Mirrors `CustomerIdentityService.spec.ts`.
    const tenantContext = {
      getClient: jest.fn().mockReturnValue({
        companyUser: {
          create: companyUserCreate,
          findMany: companyUserFindMany,
          findUnique: companyUserFindUnique,
          update: companyUserUpdate,
        },
      }),
    };
    service = new UsersService(userRepo, membershipRepo, tenantContext as never);
  });

  describe('create', () => {
    it('hashes the password and persists the explicit bitmask on the tenant CompanyUser, not on the user row', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue(VALID_HASH);
      userRepo.create.mockResolvedValue(baseUser);

      const result = await service.create(ACTOR, {
        login: 'jdoe',
        password: 'plaintext',
        fullName: 'John Doe',
        roles: 8,
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('plaintext', 10);
      expect(userRepo.create).toHaveBeenCalledWith(expect.not.objectContaining({ roles: expect.anything() }));
      expect(companyUserCreate).toHaveBeenCalledWith({
        data: { id: baseUser.id, role: 8, createdByCompanyUserId: ACTOR.companyUserId },
      });
      expect(result.roles).toBe(8);
    });

    it('creates an ACTIVE Membership scoped to the ACTOR\'s company — the read half of the access grant D1 moved off the tenant row', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue(VALID_HASH);
      userRepo.create.mockResolvedValue(baseUser);

      await service.create(ACTOR, { login: 'jdoe', password: 'plaintext', fullName: 'John Doe' });

      expect(membershipRepo.create).toHaveBeenCalledWith({
        userId: baseUser.id,
        companyId: ACTOR.companyId,
        status: 'ACTIVE',
      });
    });

    it('defaults to the `user` role when none is requested', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue(VALID_HASH);
      userRepo.create.mockResolvedValue(baseUser);

      const result = await service.create(ACTOR, { login: 'jdoe', password: 'plaintext', fullName: 'John Doe' });

      expect(result.roles).toBe(1);
    });

    it('maps a duplicate login to ConflictException, writing neither the tenant CompanyUser nor the Membership', async () => {
      const { DuplicateLoginError } = jest.requireActual('@store-mgmt/domain');
      (bcrypt.hash as jest.Mock).mockResolvedValue(VALID_HASH);
      userRepo.create.mockRejectedValue(new DuplicateLoginError('login "jdoe" is already in use'));

      await expect(
        service.create(ACTOR, { login: 'jdoe', password: 'plaintext', fullName: 'John Doe' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(companyUserCreate).not.toHaveBeenCalled();
      expect(membershipRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns an empty list when the company has no Memberships, without touching the tenant client', async () => {
      membershipRepo.listByCompany.mockResolvedValue([]);

      const result = await service.list(TEST_COMPANY_ID);

      expect(result).toEqual([]);
      expect(companyUserFindMany).not.toHaveBeenCalled();
    });

    it('joins Membership (master) with tenant CompanyUser (role) and User, never leaking passwordHash', async () => {
      membershipRepo.listByCompany.mockResolvedValue([membership('user-1')]);
      companyUserFindMany.mockResolvedValue([{ id: 'user-1', role: 4 }]);
      userRepo.findById.mockResolvedValue(baseUser);

      const result = await service.list(TEST_COMPANY_ID);

      expect(companyUserFindMany).toHaveBeenCalledWith({ where: { id: { in: ['user-1'] } } });
      expect(result).toHaveLength(1);
      expect(result[0].roles).toBe(4);
      expect(result[0]).not.toHaveProperty('passwordHash');
    });

    it('reports role 0 (logged) for a Membership with no matching tenant CompanyUser row', async () => {
      membershipRepo.listByCompany.mockResolvedValue([membership('user-1')]);
      companyUserFindMany.mockResolvedValue([]);
      userRepo.findById.mockResolvedValue(baseUser);

      const result = await service.list(TEST_COMPANY_ID);

      expect(result[0].roles).toBe(0);
    });
  });

  describe('findById', () => {
    it('returns the mapped user with the tenant-scoped role', async () => {
      userRepo.findById.mockResolvedValue(baseUser);
      companyUserFindUnique.mockResolvedValue({ id: 'user-1', role: 2 });

      const result = await service.findById('user-1');

      expect(result.login).toBe('jdoe');
      expect(result.roles).toBe(2);
      expect(companyUserFindUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('throws NotFoundException for an unknown id, without querying the tenant client', async () => {
      userRepo.findById.mockResolvedValue(null);
      await expect(service.findById('ghost')).rejects.toBeInstanceOf(NotFoundException);
      expect(companyUserFindUnique).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('routes a role change to the tenant CompanyUser and never to the user row', async () => {
      userRepo.findById.mockResolvedValue(baseUser);
      userRepo.update.mockResolvedValue(baseUser);

      const result = await service.update('user-1', { roles: 2 });

      // The profile patch reaches `userRepository` stripped of `roles` —
      // `app_user` has no such column since migration 002.
      expect(userRepo.update).toHaveBeenCalledWith('user-1', {});
      expect(companyUserUpdate).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { role: 2 } });
      expect(result.roles).toBe(2);
    });

    it('leaves the tenant CompanyUser untouched and reports its CURRENT role when `roles` is omitted', async () => {
      userRepo.findById.mockResolvedValue(baseUser);
      userRepo.update.mockResolvedValue({ ...baseUser, fullName: 'Renamed' });
      companyUserFindUnique.mockResolvedValue({ id: 'user-1', role: 8 });

      const result = await service.update('user-1', { fullName: 'Renamed' });

      expect(companyUserUpdate).not.toHaveBeenCalled();
      expect(result.roles).toBe(8);
    });

    it('throws NotFoundException for an unknown id, without calling update', async () => {
      userRepo.findById.mockResolvedValue(null);
      await expect(service.update('ghost', { roles: 2 })).rejects.toBeInstanceOf(NotFoundException);
      expect(userRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('sets isActive=false, never a hard delete', async () => {
      userRepo.findById.mockResolvedValue(baseUser);
      userRepo.update.mockResolvedValue({ ...baseUser, isActive: false });
      companyUserFindUnique.mockResolvedValue({ id: 'user-1', role: 1 });

      const result = await service.deactivate('user-1');

      expect(userRepo.update).toHaveBeenCalledWith('user-1', { isActive: false });
      expect(result.isActive).toBe(false);
    });

    it('throws NotFoundException for an unknown id', async () => {
      userRepo.findById.mockResolvedValue(null);
      await expect(service.deactivate('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
