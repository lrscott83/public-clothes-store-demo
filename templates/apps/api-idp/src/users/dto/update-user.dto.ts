import { IsBoolean, IsEmail, IsInt, IsOptional, IsString } from 'class-validator';

/**
 * Partial update for `PATCH /users/:id` — profile fields and/or `roles`
 * bitmask reassignment. SECURITY (FIX 4): deliberately does NOT expose
 * `passwordHash` (or `login`) — password changes go through the dedicated
 * `change-password`/`password-reset` flows only, never this generic patch.
 * The global `ValidationPipe` (`whitelist: true, forbidNonWhitelisted: true`)
 * rejects any request carrying a field not decorated below — this class IS
 * the mass-assignment allow-list.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  cellPhone?: string;

  @IsOptional()
  @IsInt()
  roles?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
