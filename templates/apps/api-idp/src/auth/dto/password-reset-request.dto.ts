import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Request body for `POST /auth/password-reset/request`. Accepts `login`
 * (the auth identifier — NOT `email`, which is optional/non-unique) so the
 * generic enumeration-safe response has a single, unambiguous lookup key.
 */
export class PasswordResetRequestDto {
  @IsString()
  @IsNotEmpty()
  login!: string;
}
