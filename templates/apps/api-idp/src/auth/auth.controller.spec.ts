import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DuplicateLoginError, InvalidUserError } from '@store-mgmt/domain';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LocalAuthGuard } from './local-auth.guard.js';

type AuthServiceMock = {
  validateUser: jest.Mock;
  login: jest.Mock;
  signup: jest.Mock;
  refresh: jest.Mock;
  changePassword: jest.Mock;
  initiatePasswordReset: jest.Mock;
  resetPassword: jest.Mock;
};

const sampleUser = {
  id: 'user-1',
  login: 'jdoe',
  fullName: 'John Doe',
  email: null,
  cellPhone: null,
  isActive: true,
  roles: 1,
  roleLabels: ['Cliente'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('AuthController', () => {
  let app: INestApplication;
  let service: AuthServiceMock;

  beforeEach(async () => {
    service = {
      validateUser: jest.fn(),
      login: jest.fn(),
      signup: jest.fn(),
      refresh: jest.fn(),
      changePassword: jest.fn(),
      initiatePasswordReset: jest.fn(),
      resetPassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    })
      .overrideGuard(LocalAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = sampleUser;
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('returns 200 with access+refresh tokens on success', async () => {
      service.login.mockResolvedValue({
        accessToken: 'access.jwt',
        refreshToken: 'refresh.jwt',
        user: sampleUser,
      });

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ login: 'jdoe', password: 'correct' });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBe('access.jwt');
      expect(response.body.refreshToken).toBe('refresh.jwt');
    });
  });

  describe('POST /auth/signup', () => {
    it('returns 201 with the created user', async () => {
      service.signup.mockResolvedValue(sampleUser);

      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ login: 'jdoe', password: 'plaintext', fullName: 'John Doe' });

      expect(response.status).toBe(201);
      expect(response.body.login).toBe('jdoe');
    });

    it('maps InvalidUserError to 400', async () => {
      service.signup.mockRejectedValue(new InvalidUserError('User login must not be empty'));

      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ login: '', password: 'plaintext', fullName: 'John Doe' });

      expect(response.status).toBe(400);
    });

    it('maps DuplicateLoginError to 409', async () => {
      service.signup.mockRejectedValue(new DuplicateLoginError('login "jdoe" is already in use'));

      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ login: 'jdoe', password: 'plaintext', fullName: 'John Doe' });

      expect(response.status).toBe(409);
    });
  });

  describe('POST /auth/refresh', () => {
    it('returns 200 with a rotated pair', async () => {
      service.refresh.mockResolvedValue({ accessToken: 'new.access', refreshToken: 'new.refresh' });

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'old.refresh' });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBe('new.access');
    });

    it('propagates a 401 on reuse/invalid token', async () => {
      const { UnauthorizedException } = jest.requireActual('@nestjs/common');
      service.refresh.mockRejectedValue(new UnauthorizedException('Refresh token inválido'));

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'reused.refresh' });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /auth/password-reset/request and /confirm', () => {
    it('request returns 200 with a generic message and NEVER a resetToken field', async () => {
      service.initiatePasswordReset.mockResolvedValue({ message: 'generic' });

      const response = await request(app.getHttpServer())
        .post('/auth/password-reset/request')
        .send({ login: 'jdoe' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('generic');
      // SECURITY: public/unauthenticated endpoint must never echo the token.
      expect(response.body.resetToken).toBeUndefined();
    });

    it('confirm returns 200 on success', async () => {
      service.resetPassword.mockResolvedValue(undefined);

      const response = await request(app.getHttpServer())
        .post('/auth/password-reset/confirm')
        .send({ token: 'reset-token', newPassword: 'new-password' });

      expect(response.status).toBe(200);
    });
  });
});
