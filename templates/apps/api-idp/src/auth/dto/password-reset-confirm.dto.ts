import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/** Request body for `POST /auth/password-reset/confirm`. */
export class PasswordResetConfirmDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
