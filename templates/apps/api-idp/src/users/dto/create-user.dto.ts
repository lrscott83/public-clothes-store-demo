/**
 * Admin/owner-only user creation. Unlike `SignupDto` (public self-registration,
 * always `user` role), this accepts an explicit `roles` bitmask — the
 * privilege-assignment path, guarded by `@Roles(admin, owner)` at the controller.
 */
export class CreateUserDto {
  login!: string;
  password!: string;
  fullName!: string;
  email?: string;
  cellPhone?: string;
  roles?: number;
}
