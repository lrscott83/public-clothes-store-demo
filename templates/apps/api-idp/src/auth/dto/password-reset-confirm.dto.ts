/** Request body for `POST /auth/password-reset/confirm`. */
export class PasswordResetConfirmDto {
  token!: string;
  newPassword!: string;
}
