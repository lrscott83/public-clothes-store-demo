import { RoleHelpers, type User as DomainUser } from '@store-mgmt/domain';
import type { UserResponseDto } from '../dto/user-response.dto.js';

/** Maps a domain `User` to the API response shape — NEVER includes `passwordHash`. */
export function userToResponseDto(user: DomainUser): UserResponseDto {
  return {
    id: user.id,
    login: user.login,
    fullName: user.fullName,
    email: user.email,
    cellPhone: user.cellPhone,
    isActive: user.isActive,
    roles: user.roles,
    roleLabels: RoleHelpers.getRoleLabels(user.roles),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
