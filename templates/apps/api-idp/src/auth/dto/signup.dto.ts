import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Request body for `POST /auth/signup` — public self-registration. Always
 * creates a plain `user`-role account; `roles` is NOT accepted here.
 * Privilege assignment is an admin/owner-only action (see `users/dto/create-user.dto.ts`).
 */
export class SignupDto {
  @IsString()
  @IsNotEmpty()
  login!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  cellPhone?: string;
}
