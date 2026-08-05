/**
 * Response shape for `POST /auth/signup`. Deliberately NARROWER than
 * `UserResponseDto` — no `roles`/`roleLabels` — because a fresh registration
 * has no `Company`/`CompanyUser`/`Membership` yet (see `AuthService.signup`,
 * `create-company.saga.ts`). Reporting a role here would be guessing a bit
 * that does not exist; `POST /companies` is the first place a role appears.
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
