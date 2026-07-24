import { IsNotEmpty, IsString } from 'class-validator';

/** Request body for `POST /auth/login` — LOCAL strategy field names (`login`+`password`), NEVER `email` (login-based auth, spec `salesops-identity`). */
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  login!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
