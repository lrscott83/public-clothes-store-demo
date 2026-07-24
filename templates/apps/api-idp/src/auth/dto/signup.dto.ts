/**
 * Request body for `POST /auth/signup` — public self-registration. Always
 * creates a plain `user`-role account; `roles` is NOT accepted here.
 * Privilege assignment is an admin/owner-only action (see `users/dto/create-user.dto.ts`).
 */
export class SignupDto {
  login!: string;
  password!: string;
  fullName!: string;
  email?: string;
  cellPhone?: string;
}
