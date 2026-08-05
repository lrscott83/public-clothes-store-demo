import type { SignupResponseDto } from './signup-response.dto.js';

/**
 * Response shape for `POST /auth/login`'s token issuance. `user` carries
 * `SignupResponseDto` — identity only, no `roles`/`roleLabels` — because
 * login, like signup, no longer resolves a company-scoped role (design
 * D4/D7): the caller may belong to zero, one, or several companies, and
 * that ambiguity is exactly what `TenantContextGuard` resolves per request,
 * never `AuthService` at token-issuance time. See `AuthService.issueTokens`.
 */
export class LoginResponseDto {
  accessToken!: string;
  refreshToken!: string;
  user!: SignupResponseDto;
}
