import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type {
  CreateUserInput,
  ICompanyUserRepository,
  IUserRepository,
  User as DomainUser,
  UserRoleValue,
} from '@store-mgmt/domain';
import {
  COMPANY_USER_REPOSITORY,
  DuplicateLoginError,
  USER_REPOSITORY,
  USER_ROLES,
  createUser,
} from '@store-mgmt/domain';
import type { UserResponseDto } from '../auth/dto/user-response.dto.js';
import { userToResponseDto } from '../auth/mappers/user.mapper.js';
import type { CreateUserDto, UpdateUserDto } from './dto/index.js';

const SALT_ROUNDS = 10;

/**
 * Admin/owner-only user administration (design.md §6/locked matrix — `admin`
 * is system super-root, `owner` manages its own business's users).
 * `@Roles(admin, owner)` is enforced at the controller (`UsersController`),
 * NOT here — this service is the orchestration layer only.
 *
 * Role writes go to `CompanyUser`, scoped to the CALLER's `companyId`. While
 * `app_user.roles` still exists (it is dropped in Phase 3) every write updates
 * BOTH, because that column is what the §7 verification gate compares against
 * — letting the two drift would fail the gate that guards migration 002.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(COMPANY_USER_REPOSITORY) private readonly companyUserRepository: ICompanyUserRepository,
  ) {}

  /** Admin/owner-created user WITH an explicit `roles` bitmask (unlike public `AuthService.signup`, always `user`-role). */
  async create(companyId: string, dto: CreateUserDto): Promise<UserResponseDto> {
    const role = dto.roles ?? USER_ROLES.user;
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const input: CreateUserInput = {
      login: dto.login,
      passwordHash,
      fullName: dto.fullName,
      email: dto.email,
      cellPhone: dto.cellPhone,
      roles: role, // dual-write — see the class doc comment
    };
    createUser(input); // invariant check only, discarded (mirrors AuthService.signup / CustomerService)

    let created: DomainUser;
    try {
      created = await this.userRepository.create(input);
    } catch (err) {
      if (err instanceof DuplicateLoginError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }

    const assignment = await this.companyUserRepository.create({
      userId: created.id,
      companyId,
      role,
      status: 'ACTIVE',
    });

    return userToResponseDto(created, assignment.role);
  }

  /**
   * Batches the assignments for the caller's company in ONE query and joins in
   * memory — a per-user `findActiveByUserId` here would be an N+1.
   */
  async list(companyId: string): Promise<UserResponseDto[]> {
    const [rows, assignments] = await Promise.all([
      this.userRepository.list(),
      this.companyUserRepository.listByCompany(companyId),
    ]);
    const roleByUserId = new Map(assignments.map((a) => [a.userId, a.role]));

    return rows.map((user) => userToResponseDto(user, this.roleFor(user.id, roleByUserId.get(user.id))));
  }

  async findById(id: string): Promise<UserResponseDto> {
    const found = await this.userRepository.findById(id);
    if (!found) {
      throw new NotFoundException(`User "${id}" not found`);
    }
    return userToResponseDto(found, await this.currentRole(id));
  }

  async update(companyId: string, id: string, patch: UpdateUserDto): Promise<UserResponseDto> {
    const existing = await this.userRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`User "${id}" not found`);
    }

    const updated = await this.userRepository.update(id, patch);

    // `roles` is optional on the patch — only touch the assignment when the
    // caller actually asked to change it.
    if (patch.roles !== undefined) {
      const assignment = await this.companyUserRepository.updateRole(id, companyId, patch.roles);
      return userToResponseDto(updated, assignment.role);
    }

    return userToResponseDto(updated, await this.currentRole(id));
  }

  /** Deactivates (soft) a user — sets `isActive=false`. Never a hard delete (mirrors `CustomerService.softDelete`). */
  async deactivate(id: string): Promise<UserResponseDto> {
    const existing = await this.userRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`User "${id}" not found`);
    }
    const updated = await this.userRepository.update(id, { isActive: false });
    return userToResponseDto(updated, await this.currentRole(id));
  }

  private async currentRole(userId: string): Promise<UserRoleValue> {
    const assignment = await this.companyUserRepository.findActiveByUserId(userId);
    return this.roleFor(userId, assignment?.role);
  }

  /**
   * An administrative READ must not 500 because a user has no assignment — but
   * it must not invent permissions either. Reports 0 (no permissions, which is
   * the truth: that user cannot authenticate, `JwtStrategy` 403s them) and logs
   * the inconsistency so it is visible rather than merely absent.
   */
  private roleFor(userId: string, role: UserRoleValue | undefined): UserRoleValue {
    if (role === undefined) {
      this.logger.error(`MISSING_COMPANY_USER: user ${userId} has no ACTIVE CompanyUser assignment`);
      return 0;
    }
    return role;
  }
}
