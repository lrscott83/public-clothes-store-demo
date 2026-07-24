import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Thin `AuthGuard('local')` wrapper — triggers `LocalStrategy.validate` and rejects with 401 on bad credentials. */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
