import { ConflictException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type {
  Company,
  CompanyUser,
  ICompanyRepository,
  ICompanyUserRepository,
  IPasswordResetTokenRepository,
  IRefreshTokenRepository,
  IUserRepository,
  User as DomainUser,
} from '@store-mgmt/domain';
import { AuthService } from './auth.service.js';

jest.mock('bcrypt');

/** Bcrypt hash shape accepted by the domain invariant — never a real credential. */
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

function buildRefreshTokenRepoMock(): jest.Mocked<IRefreshTokenRepository> {
  return {
    create: jest.fn(),
    findByToken: jest.fn(),
    revokeIfActive: jest.fn(),
    revokeByUserId: jest.fn(),
    deleteExpired: jest.fn(),
  };
}

function buildPasswordResetTokenRepoMock(): jest.Mocked<IPasswordResetTokenRepository> {
  return {
    create: jest.fn(),
    findByToken: jest.fn(),
    markAsUsed: jest.fn(),
    revokeByUserId: jest.fn(),
    deleteExpired: jest.fn(),
  };
}

function buildJwtServiceMock(): jest.Mocked<Pick<JwtService, 'sign' | 'verify'>> {
  return {
    sign: jest.fn().mockReturnValue('signed.jwt.token'),
    verify: jest.fn(),
  } as unknown as jest.Mocked<Pick<JwtService, 'sign' | 'verify'>>;
}

const TEST_COMPANY: Company = {
  id: 'company-1',
  name: 'Tienda Principal',
  slug: 'default',
  isActive: true,
  schemaName: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function assignment(role: number): CompanyUser {
  return {
    id: 'cu-1',
    userId: 'user-1',
    companyId: TEST_COMPANY.id,
    role,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

/** Default: exactly one Company exists — the only state signup can auto-assign in. */
function buildCompanyRepoMock(): jest.Mocked<ICompanyRepository> {
  return {
    list: jest.fn().mockResolvedValue([TEST_COMPANY]),
    findById: jest.fn().mockResolvedValue(TEST_COMPANY),
  };
}

function buildCompanyUserRepoMock(): jest.Mocked<ICompanyUserRepository> {
  return {
    create: jest.fn().mockImplementation(({ role }: { role: number }) => Promise.resolve(assignment(role))),
    findActiveByUserId: jest.fn().mockResolvedValue(assignment(1)),
    findByUserAndCompany: jest.fn(),
    updateRole: jest.fn(),
    listByCompany: jest.fn().mockResolvedValue([assignment(1)]),
  };
}

describe('AuthService', () => {
  let userRepo: jest.Mocked<IUserRepository>;
  let refreshTokenRepo: jest.Mocked<IRefreshTokenRepository>;
  let passwordResetTokenRepo: jest.Mocked<IPasswordResetTokenRepository>;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign' | 'verify'>>;
  let companyRepo: jest.Mocked<ICompanyRepository>;
  let companyUserRepo: jest.Mocked<ICompanyUserRepository>;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    userRepo = buildUserRepoMock();
    refreshTokenRepo = buildRefreshTokenRepoMock();
    passwordResetTokenRepo = buildPasswordResetTokenRepoMock();
    jwtService = buildJwtServiceMock();
    companyRepo = buildCompanyRepoMock();
    companyUserRepo = buildCompanyUserRepoMock();
    service = new AuthService(
      jwtService as unknown as JwtService,
      userRepo,
      refreshTokenRepo,
      passwordResetTokenRepo,
      companyRepo,
      companyUserRepo,
    );
  });

  describe('validateUser', () => {
    it('returns the user sans hash-check-failure when login+password match (bcrypt.compare)', async () => {
      userRepo.findByLogin.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('jdoe', 'correct-password');

      expect(bcrypt.compare).toHaveBeenCalledWith('correct-password', VALID_HASH);
      expect(result).toEqual(baseUser);
    });

    it('rejects a wrong password with UnauthorizedException', async () => {
      userRepo.findByLogin.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.validateUser('jdoe', 'wrong')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an unknown login with the SAME error class as wrong-password (no enumeration leak)', async () => {
      userRepo.findByLogin.mockResolvedValue(null);

      await expect(service.validateUser('ghost', 'whatever')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('rejects an inactive user', async () => {
      userRepo.findByLogin.mockResolvedValue({ ...baseUser, isActive: false });

      await expect(service.validateUser('jdoe', 'correct-password')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('issues an access JWT ({sub,login} only) + a persisted refresh token', async () => {
      refreshTokenRepo.create.mockResolvedValue({
        id: 'rt-1',
        token: 'rtid-abc',
        userId: baseUser.id,
        expiresAt: new Date('2999-01-01'),
        isRevoked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.login(baseUser);

      expect(jwtService.sign).toHaveBeenCalledWith({ sub: baseUser.id, login: baseUser.login });
      expect(refreshTokenRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: baseUser.id }),
      );
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toBe('signed.jwt.token');
      expect(result.user).toEqual(
        expect.objectContaining({ id: baseUser.id, login: baseUser.login }),
      );
      expect(result.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('signup', () => {
    it('creates a User via bcrypt-hashed password, defaulting to the "user" role', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue(VALID_HASH);
      userRepo.create.mockResolvedValue(baseUser);

      const result = await service.signup({
        login: 'jdoe',
        password: 'plaintext',
        fullName: 'John Doe',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('plaintext', 10);
      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ login: 'jdoe', passwordHash: VALID_HASH }),
      );
      expect(result.id).toBe(baseUser.id);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('maps a duplicate login to ConflictException', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue(VALID_HASH);
      const { DuplicateLoginError } = jest.requireActual('@store-mgmt/domain');
      userRepo.create.mockRejectedValue(new DuplicateLoginError('login "jdoe" is already in use'));

      await expect(
        service.signup({ login: 'jdoe', password: 'plaintext', fullName: 'John Doe' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('assigns the new user to the sole Company with the base `user` role', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue(VALID_HASH);
      userRepo.create.mockResolvedValue(baseUser);

      const result = await service.signup({ login: 'jdoe', password: 'plaintext', fullName: 'John Doe' });

      expect(companyUserRepo.create).toHaveBeenCalledWith({
        userId: baseUser.id,
        companyId: TEST_COMPANY.id,
        role: 1,
        status: 'ACTIVE',
      });
      expect(result.roles).toBe(1);
    });

    it('zero Companies → 500, and NOTHING is written (resolution runs before any write, A5)', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue(VALID_HASH);
      companyRepo.list.mockResolvedValue([]);

      await expect(
        service.signup({ login: 'jdoe', password: 'plaintext', fullName: 'John Doe' }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(userRepo.create).not.toHaveBeenCalled();
      expect(companyUserRepo.create).not.toHaveBeenCalled();
    });

    it('more than one Company → 409, and NOTHING is written — never an arbitrary pick', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue(VALID_HASH);
      companyRepo.list.mockResolvedValue([TEST_COMPANY, { ...TEST_COMPANY, id: 'company-2', slug: 'second' }]);

      await expect(
        service.signup({ login: 'jdoe', password: 'plaintext', fullName: 'John Doe' }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(userRepo.create).not.toHaveBeenCalled();
      expect(companyUserRepo.create).not.toHaveBeenCalled();
    });

    it('writes the bitmask ONLY to the assignment — the `app_user` payload carries no role', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue(VALID_HASH);
      userRepo.create.mockResolvedValue(baseUser);

      await service.signup({ login: 'jdoe', password: 'plaintext', fullName: 'John Doe' });

      // Migration 002 dropped `app_user.roles`; a second write path here would
      // reintroduce exactly the drift the reframe exists to remove.
      expect(userRepo.create).toHaveBeenCalledWith(expect.not.objectContaining({ roles: expect.anything() }));
      expect(companyUserRepo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 1 }));
    });
  });

  describe('refresh', () => {
    it('rotates: valid unused token issues a NEW access+refresh pair and marks the old one revoked', async () => {
      jwtService.verify.mockReturnValue({ sub: baseUser.id, type: 'refresh', rtid: 'rtid-old' });
      refreshTokenRepo.findByToken.mockResolvedValue({
        id: 'rt-1',
        token: 'rtid-old',
        userId: baseUser.id,
        expiresAt: new Date('2999-01-01'),
        isRevoked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      userRepo.findById.mockResolvedValue(baseUser);
      refreshTokenRepo.revokeIfActive.mockResolvedValue(1);
      refreshTokenRepo.create.mockResolvedValue({
        id: 'rt-2',
        token: 'rtid-new',
        userId: baseUser.id,
        expiresAt: new Date('2999-01-01'),
        isRevoked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.refresh('refresh.jwt.old');

      expect(refreshTokenRepo.revokeIfActive).toHaveBeenCalledWith('rt-1');
      expect(refreshTokenRepo.create).toHaveBeenCalled();
      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toBe('signed.jwt.token');
    });

    it('replaying an already-rotated (revoked) token revokes the WHOLE family and rejects', async () => {
      jwtService.verify.mockReturnValue({ sub: baseUser.id, type: 'refresh', rtid: 'rtid-old' });
      refreshTokenRepo.findByToken.mockResolvedValue({
        id: 'rt-1',
        token: 'rtid-old',
        userId: baseUser.id,
        expiresAt: new Date('2999-01-01'),
        isRevoked: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(service.refresh('refresh.jwt.old')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(refreshTokenRepo.revokeByUserId).toHaveBeenCalledWith(baseUser.id);
      expect(refreshTokenRepo.revokeIfActive).not.toHaveBeenCalled();
    });

    it('a concurrent-rotation race (revokeIfActive returns 0) also revokes the family and rejects', async () => {
      jwtService.verify.mockReturnValue({ sub: baseUser.id, type: 'refresh', rtid: 'rtid-old' });
      refreshTokenRepo.findByToken.mockResolvedValue({
        id: 'rt-1',
        token: 'rtid-old',
        userId: baseUser.id,
        expiresAt: new Date('2999-01-01'),
        isRevoked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      userRepo.findById.mockResolvedValue(baseUser);
      refreshTokenRepo.revokeIfActive.mockResolvedValue(0);

      await expect(service.refresh('refresh.jwt.old')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(refreshTokenRepo.revokeByUserId).toHaveBeenCalledWith(baseUser.id);
    });

    it('rejects an invalid/unverifiable refresh JWT', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('bad signature');
      });

      await expect(service.refresh('garbage')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refreshTokenRepo.findByToken).not.toHaveBeenCalled();
    });

    it('rejects an unknown rtid', async () => {
      jwtService.verify.mockReturnValue({ sub: baseUser.id, type: 'refresh', rtid: 'unknown' });
      refreshTokenRepo.findByToken.mockResolvedValue(null);

      await expect(service.refresh('refresh.jwt')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('changePassword', () => {
    it('verifies the current hash, rehashes, and revokes every refresh token', async () => {
      userRepo.findById.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newhash');

      await service.changePassword(baseUser.id, 'current', 'new-password');

      expect(bcrypt.compare).toHaveBeenCalledWith('current', VALID_HASH);
      // SECURITY (FIX 4): password changes go through the DEDICATED
      // `updatePassword` port method — never the generic `update`.
      expect(userRepo.updatePassword).toHaveBeenCalledWith(baseUser.id, 'newhash');
      expect(userRepo.update).not.toHaveBeenCalled();
      expect(refreshTokenRepo.revokeByUserId).toHaveBeenCalledWith(baseUser.id);
    });

    it('rejects an incorrect current password WITHOUT revoking sessions', async () => {
      userRepo.findById.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword(baseUser.id, 'wrong', 'new-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refreshTokenRepo.revokeByUserId).not.toHaveBeenCalled();
    });
  });

  describe('initiatePasswordReset / resetPassword', () => {
    it('mints a single-use token for a known, active login', async () => {
      userRepo.findByLogin.mockResolvedValue(baseUser);

      const result = await service.initiatePasswordReset('jdoe');

      expect(passwordResetTokenRepo.revokeByUserId).toHaveBeenCalledWith(baseUser.id);
      expect(passwordResetTokenRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: baseUser.id }),
      );
      expect(result.message).toBeTruthy();
      // SECURITY: the token must NEVER be echoed back on the public,
      // unauthenticated response — that would be an account-takeover oracle.
      expect(result).not.toHaveProperty('resetToken');
    });

    it('returns the same generic message for an unknown login (enumeration-safe), with NO token field on either response', async () => {
      userRepo.findByLogin.mockResolvedValue(null);

      const known = await (async () => {
        userRepo.findByLogin.mockResolvedValueOnce(baseUser);
        return service.initiatePasswordReset('jdoe');
      })();
      const unknown = await service.initiatePasswordReset('ghost');

      expect(unknown.message).toBe(known.message);
      expect(passwordResetTokenRepo.create).toHaveBeenCalledTimes(1);
      // SECURITY: identical shape (no resetToken) whether the login exists or not.
      expect(known).not.toHaveProperty('resetToken');
      expect(unknown).not.toHaveProperty('resetToken');
      expect(Object.keys(known)).toEqual(Object.keys(unknown));
    });

    it('resetPassword rejects a second use of the same (already-used) token', async () => {
      passwordResetTokenRepo.findByToken.mockResolvedValue({
        id: 'prt-1',
        token: 'reset-token',
        userId: baseUser.id,
        expiresAt: new Date('2999-01-01'),
        isUsed: true,
        createdAt: new Date(),
      });

      await expect(service.resetPassword('reset-token', 'new-password')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('resetPassword rejects an expired token', async () => {
      passwordResetTokenRepo.findByToken.mockResolvedValue({
        id: 'prt-1',
        token: 'reset-token',
        userId: baseUser.id,
        expiresAt: new Date('2020-01-01'),
        isUsed: false,
        createdAt: new Date(),
      });

      await expect(service.resetPassword('reset-token', 'new-password')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('resetPassword succeeds once: hashes, marks used, revokes all refresh tokens', async () => {
      passwordResetTokenRepo.findByToken.mockResolvedValue({
        id: 'prt-1',
        token: 'reset-token',
        userId: baseUser.id,
        expiresAt: new Date('2999-01-01'),
        isUsed: false,
        createdAt: new Date(),
      });
      userRepo.findById.mockResolvedValue(baseUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newhash');

      await service.resetPassword('reset-token', 'new-password');

      // SECURITY (FIX 4): dedicated `updatePassword` — never generic `update`.
      expect(userRepo.updatePassword).toHaveBeenCalledWith(baseUser.id, 'newhash');
      expect(userRepo.update).not.toHaveBeenCalled();
      expect(passwordResetTokenRepo.markAsUsed).toHaveBeenCalledWith('prt-1');
      expect(refreshTokenRepo.revokeByUserId).toHaveBeenCalledWith(baseUser.id);
    });
  });
});
