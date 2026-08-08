import { IsNotEmpty, IsString } from 'class-validator';

/** Request body for `POST /auth/refresh`. */
export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
