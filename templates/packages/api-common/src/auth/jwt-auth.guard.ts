import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Thin `AuthGuard('jwt')` wrapper — triggers `JwtStrategy.validate` and rejects with 401 on an invalid/missing/expired token. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
