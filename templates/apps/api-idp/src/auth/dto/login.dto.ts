/** Request body for `POST /auth/login` — LOCAL strategy field names (`login`+`password`), NEVER `email` (login-based auth, spec `salesops-identity`). */
export class LoginDto {
  login!: string;
  password!: string;
}
