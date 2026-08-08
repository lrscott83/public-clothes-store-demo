import { IsString, MinLength } from 'class-validator';

/** Request body for `POST /auth/change-password` (requires `JwtAuthGuard`). Revokes every refresh token for the caller on success. */
export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
