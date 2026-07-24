import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import type { User as DomainUser } from '@store-mgmt/domain';
import { AuthService } from './auth.service.js';

/**
 * The ONLY place in the whole system that ever sees a plaintext password
 * (design.md §5/§7 ADR-1). Authenticates by `login` (NOT `email`) + password
 * — `usernameField: 'login'` — delegating straight to
 * `AuthService.validateUser` (bcrypt.compare happens there).
 */
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'login', passwordField: 'password' });
  }

  async validate(login: string, password: string): Promise<DomainUser> {
    return this.authService.validateUser(login, password);
  }
}
