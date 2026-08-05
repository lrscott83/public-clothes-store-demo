/**
 * Response shape for `POST /auth/signup`, and reused as `LoginResponseDto.user`
 * (`POST /auth/login`, token refresh). Deliberately NARROWER than
 * `UserResponseDto` — no `roles`/`roleLabels` — because neither a fresh
 * registration nor an authentication event has a single, unambiguous
 * company-scoped role to report: a user may hold zero, one, or several
 * ACTIVE Memberships (design D4/D7), and picking one here would be exactly
 * the guess `TenantContextGuard` refuses to make per request. `POST
 * /companies`/`GET` endpoints behind `TenantContextGuard` are the first
 * place a role appears.
 */
export class SignupResponseDto {
  id!: string;
  login!: string;
  fullName!: string;
  email!: string | null;
  cellPhone!: string | null;
  isActive!: boolean;
  createdAt!: string;
  updatedAt!: string;
}
