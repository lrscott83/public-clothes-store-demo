/** Request body for `POST /auth/change-password` (requires `JwtAuthGuard`). Revokes every refresh token for the caller on success. */
export class ChangePasswordDto {
  currentPassword!: string;
  newPassword!: string;
}
