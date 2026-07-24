import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { CreateUserInput, IUserRepository } from '@store-mgmt/domain';
import { DuplicateLoginError, USER_REPOSITORY, createUser } from '@store-mgmt/domain';
import type { UserResponseDto } from '../auth/dto/user-response.dto.js';
import { userToResponseDto } from '../auth/mappers/user.mapper.js';
import type { CreateUserDto, UpdateUserDto } from './dto/index.js';

const SALT_ROUNDS = 10;

/**
 * Admin/owner-only user administration (design.md §6/locked matrix — `admin`
 * is system super-root, `owner` manages its own business's users).
 * `@Roles(admin, owner)` is enforced at the controller (`UsersController`),
 * NOT here — this service is the orchestration layer only.
 */
@Injectable()
export class UsersService {
  constructor(@Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository) {}

  /** Admin/owner-created user WITH an explicit `roles` bitmask (unlike public `AuthService.signup`, always `user`-role). */
  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const input: CreateUserInput = {
      login: dto.login,
      passwordHash,
      fullName: dto.fullName,
      email: dto.email,
      cellPhone: dto.cellPhone,
      roles: dto.roles,
    };
    createUser(input); // invariant check only, discarded (mirrors AuthService.signup / CustomerService)

    try {
      const created = await this.userRepository.create(input);
      return userToResponseDto(created);
    } catch (err) {
      if (err instanceof DuplicateLoginError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  async list(): Promise<UserResponseDto[]> {
    const rows = await this.userRepository.list();
    return rows.map(userToResponseDto);
  }

  async findById(id: string): Promise<UserResponseDto> {
    const found = await this.userRepository.findById(id);
    if (!found) {
      throw new NotFoundException(`User "${id}" not found`);
    }
    return userToResponseDto(found);
  }

  async update(id: string, patch: UpdateUserDto): Promise<UserResponseDto> {
    const existing = await this.userRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`User "${id}" not found`);
    }
    const updated = await this.userRepository.update(id, patch);
    return userToResponseDto(updated);
  }

  /** Deactivates (soft) a user — sets `isActive=false`. Never a hard delete (mirrors `CustomerService.softDelete`). */
  async deactivate(id: string): Promise<UserResponseDto> {
    const existing = await this.userRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`User "${id}" not found`);
    }
    const updated = await this.userRepository.update(id, { isActive: false });
    return userToResponseDto(updated);
  }
}
