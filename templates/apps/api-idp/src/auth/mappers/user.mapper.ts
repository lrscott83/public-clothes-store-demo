import { RoleHelpers, type User as DomainUser, type UserRoleValue } from '@store-mgmt/domain';
import type { UserResponseDto } from '../dto/user-response.dto.js';

/**
 * Maps a domain `User` to the API response shape — NEVER includes
 * `passwordHash`.
 *
 * `roles` is an EXPLICIT parameter rather than a field read off `user`: the
 * authoritative bitmask lives on the caller's `CompanyUser` assignment, not on
 * the `User` row (which loses its `roles` column in Phase 3). Passing it in is
 * what turns every caller that has not been migrated into a compile error
 * instead of a response that silently reports a stale role.
 *
 * `UserResponseDto.roles`/`roleLabels` keep their exact previous shape, so
 * this is not a client-visible change.
 */
export function userToResponseDto(user: DomainUser, roles: UserRoleValue): UserResponseDto {
  return {
    id: user.id,
    login: user.login,
    fullName: user.fullName,
    email: user.email,
    cellPhone: user.cellPhone,
    isActive: user.isActive,
    roles,
    roleLabels: RoleHelpers.getRoleLabels(roles),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
