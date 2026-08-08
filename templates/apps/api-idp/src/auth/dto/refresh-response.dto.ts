/** Response shape for `POST /auth/refresh` — the rotated access+refresh pair. */
export class RefreshResponseDto {
  accessToken!: string;
  refreshToken!: string;
}
