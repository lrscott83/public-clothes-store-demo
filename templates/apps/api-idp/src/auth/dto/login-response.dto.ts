import type { UserResponseDto } from './user-response.dto.js';

/** Response shape for `POST /auth/login` and `POST /auth/signup`'s underlying token issuance. */
export class LoginResponseDto {
  accessToken!: string;
  refreshToken!: string;
  user!: UserResponseDto;
}
