import { UnauthorizedException, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard, RolesGuard } from '@store-mgmt/api-common';
import { USER_ROLES } from '@store-mgmt/domain';
import request from 'supertest';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

type UsersServiceMock = {
  create: jest.Mock;
  list: jest.Mock;
  findById: jest.Mock;
  update: jest.Mock;
  deactivate: jest.Mock;
};

const sampleUser = {
  id: 'user-1',
  login: 'jdoe',
  fullName: 'John Doe',
  email: null,
  cellPhone: null,
  isActive: true,
  roles: USER_ROLES.user,
  roleLabels: ['Cliente'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Builds a test app with `JwtAuthGuard`/`RolesGuard` overridden to inject `req.user` with the given `roles`, exercising the REAL `RolesGuard` logic (not a bypass). */
async function buildApp(
  service: UsersServiceMock,
  callerRoles: number | null,
): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [UsersController],
    providers: [{ provide: UsersService, useValue: service }, RolesGuard],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({
      canActivate: (context: ExecutionContext) => {
        if (callerRoles === null) {
        // Simulates the real `JwtAuthGuard` rejecting an unauthenticated request -> 401.
        throw new UnauthorizedException();
      }
        const req = context.switchToHttp().getRequest();
        req.user = { ...sampleUser, roles: callerRoles };
        return true;
      },
    })
    .compile();

  const app = module.createNestApplication();
  await app.init();
  return app;
}

describe('UsersController', () => {
  let service: UsersServiceMock;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
    };
  });

  it('rejects an unauthenticated request with 401', async () => {
    const app = await buildApp(service, null);
    const response = await request(app.getHttpServer()).get('/users');
    expect(response.status).toBe(401);
    await app.close();
  });

  it('rejects a caller holding only "user" with 403', async () => {
    const app = await buildApp(service, USER_ROLES.user);
    const response = await request(app.getHttpServer()).get('/users');
    expect(response.status).toBe(403);
    await app.close();
  });

  it('admits an "owner" caller -> 200 list', async () => {
    service.list.mockResolvedValue([sampleUser]);
    const app = await buildApp(service, USER_ROLES.owner);
    const response = await request(app.getHttpServer()).get('/users');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([sampleUser]);
    await app.close();
  });

  it('admits an "admin" caller (super-root) -> 200 list', async () => {
    service.list.mockResolvedValue([sampleUser]);
    const app = await buildApp(service, USER_ROLES.admin);
    const response = await request(app.getHttpServer()).get('/users');
    expect(response.status).toBe(200);
    await app.close();
  });

  it('POST /users creates a user with an explicit roles bitmask', async () => {
    service.create.mockResolvedValue({ ...sampleUser, roles: USER_ROLES.owner });
    const app = await buildApp(service, USER_ROLES.admin);

    const response = await request(app.getHttpServer())
      .post('/users')
      .send({ login: 'newowner', password: 'plaintext', fullName: 'New Owner', roles: USER_ROLES.owner });

    expect(response.status).toBe(201);
    expect(response.body.roles).toBe(USER_ROLES.owner);
    await app.close();
  });

  it('GET /users/:id returns 200', async () => {
    service.findById.mockResolvedValue(sampleUser);
    const app = await buildApp(service, USER_ROLES.owner);
    const response = await request(app.getHttpServer()).get('/users/user-1');
    expect(response.status).toBe(200);
    await app.close();
  });

  it('PATCH /users/:id updates roles', async () => {
    service.update.mockResolvedValue({ ...sampleUser, roles: USER_ROLES.warehouse_operator });
    const app = await buildApp(service, USER_ROLES.owner);
    const response = await request(app.getHttpServer())
      .patch('/users/user-1')
      .send({ roles: USER_ROLES.warehouse_operator });
    expect(response.status).toBe(200);
    expect(response.body.roles).toBe(USER_ROLES.warehouse_operator);
    await app.close();
  });

  describe('privilege ceiling — non-admin cannot grant the admin bit (SECURITY)', () => {
    it('POST /users: an "owner" caller setting the admin bit is rejected with 403', async () => {
      const app = await buildApp(service, USER_ROLES.owner);
      const response = await request(app.getHttpServer())
        .post('/users')
        .send({ login: 'wannabe', password: 'plaintext', fullName: 'Wannabe Admin', roles: USER_ROLES.admin });
      expect(response.status).toBe(403);
      expect(service.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('POST /users: an "owner" caller setting a COMBINED bitmask including admin is rejected with 403', async () => {
      const app = await buildApp(service, USER_ROLES.owner);
      const response = await request(app.getHttpServer())
        .post('/users')
        .send({
          login: 'wannabe2',
          password: 'plaintext',
          fullName: 'Wannabe Admin Two',
          roles: USER_ROLES.owner | USER_ROLES.admin,
        });
      expect(response.status).toBe(403);
      expect(service.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('POST /users: an "admin" caller CAN set the admin bit', async () => {
      service.create.mockResolvedValue({ ...sampleUser, roles: USER_ROLES.admin });
      const app = await buildApp(service, USER_ROLES.admin);
      const response = await request(app.getHttpServer())
        .post('/users')
        .send({ login: 'newadmin', password: 'plaintext', fullName: 'New Admin', roles: USER_ROLES.admin });
      expect(response.status).toBe(201);
      expect(service.create).toHaveBeenCalled();
      await app.close();
    });

    it('PATCH /users/:id: an "owner" caller adding the admin bit is rejected with 403', async () => {
      const app = await buildApp(service, USER_ROLES.owner);
      const response = await request(app.getHttpServer())
        .patch('/users/user-1')
        .send({ roles: USER_ROLES.admin });
      expect(response.status).toBe(403);
      expect(service.update).not.toHaveBeenCalled();
      await app.close();
    });

    it('PATCH /users/:id: an "admin" caller CAN add the admin bit', async () => {
      service.update.mockResolvedValue({ ...sampleUser, roles: USER_ROLES.admin });
      const app = await buildApp(service, USER_ROLES.admin);
      const response = await request(app.getHttpServer())
        .patch('/users/user-1')
        .send({ roles: USER_ROLES.admin });
      expect(response.status).toBe(200);
      expect(service.update).toHaveBeenCalled();
      await app.close();
    });

    it('PATCH /users/:id: an "owner" caller updating fields WITHOUT touching roles is unaffected', async () => {
      service.update.mockResolvedValue({ ...sampleUser, fullName: 'Renamed' });
      const app = await buildApp(service, USER_ROLES.owner);
      const response = await request(app.getHttpServer())
        .patch('/users/user-1')
        .send({ fullName: 'Renamed' });
      expect(response.status).toBe(200);
      expect(service.update).toHaveBeenCalled();
      await app.close();
    });
  });

  it('DELETE /users/:id deactivates (soft), never a hard delete', async () => {
    service.deactivate.mockResolvedValue({ ...sampleUser, isActive: false });
    const app = await buildApp(service, USER_ROLES.owner);
    const response = await request(app.getHttpServer()).delete('/users/user-1');
    expect(response.status).toBe(200);
    expect(response.body.isActive).toBe(false);
    expect(service.deactivate).toHaveBeenCalledWith('user-1');
    await app.close();
  });
});
