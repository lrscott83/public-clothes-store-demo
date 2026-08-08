import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Admin/owner-only user creation. Unlike `SignupDto` (public self-registration,
 * always `user` role), this accepts an explicit `roles` bitmask — the
 * privilege-assignment path, guarded by `@Roles(admin, owner)` at the
 * controller (plus the admin-bit privilege-ceiling check, SECURITY FIX 3).
 * `whitelist: true` (global `ValidationPipe`, SECURITY FIX 4) strips/rejects
 * any field NOT decorated below — this is the mass-assignment allow-list.
 */
export class CreateUserDto {
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

  @IsOptional()
  @IsInt()
  roles?: number;
}
