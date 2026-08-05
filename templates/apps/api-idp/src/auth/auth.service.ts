import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions, type JwtVerifyOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type {
  CreateUserInput,
  ICompanyUserRepository,
  IPasswordResetTokenRepository,
  IRefreshTokenRepository,
  IUserRepository,
  User as DomainUser,
  UserRoleValue,
} from '@store-mgmt/domain';
import {
  COMPANY_USER_REPOSITORY,
  DuplicateLoginError,
  PASSWORD_RESET_TOKEN_REPOSITORY,
  REFRESH_TOKEN_REPOSITORY,
  USER_REPOSITORY,
  createUser,
} from '@store-mgmt/domain';
import { REFRESH_TOKEN_CONFIG, type JwtAccessPayload } from '@store-mgmt/api-common';
import type { LoginResponseDto } from './dto/login-response.dto.js';
import type { RefreshResponseDto } from './dto/refresh-response.dto.js';
import type { SignupDto } from './dto/signup.dto.js';
import type { SignupResponseDto } from './dto/signup-response.dto.js';
import { userToResponseDto, userToSignupResponseDto } from './mappers/user.mapper.js';

const SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MINUTES = 15;
/** Generic, enumeration-safe response — never reveals whether `login` matched a real account (spec: "Unknown login rejected"/reset scenarios). */
const GENERIC_RESET_MESSAGE =
  'Si la cuenta existe, se generó un token de restablecimiento de contraseña.';
/** Same error class/message for unknown-login and wrong-password — no user-enumeration leak. */
const INVALID_CREDENTIALS_MESSAGE = 'Login o contraseña inválidos';

interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  rtid: string;
}

/**
 * Auth orchestration — the only app-edge layer allowed to hash/compare
 * passwords (`bcrypt`) or mint JWTs. Mirrors poolops-biz
 * `apps/api-idp/src/auth/auth.service.ts`, adapted to `login`-based auth
 * (never `email`) and this project's port method names.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokenRepository: IRefreshTokenRepository,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly passwordResetTokenRepository: IPasswordResetTokenRepository,
    @Inject(COMPANY_USER_REPOSITORY) private readonly companyUserRepository: ICompanyUserRepository,
  ) {}

  /**
   * Verifies `login`+`password` via `bcrypt.compare`. Unknown login, wrong
   * password, and inactive user ALL reject with the exact same
   * `UnauthorizedException` — no user-enumeration leak (spec scenario
   * "Unknown login rejected").
   */
  async validateUser(login: string, password: string): Promise<DomainUser> {
    const user = await this.userRepository.findByLogin(login);
    if (!user || !user.isActive) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }
    return user;
  }

  /** Issues a fresh access+refresh pair for an already-validated user (`LocalStrategy` has run). */
  async login(user: DomainUser): Promise<LoginResponseDto> {
    return this.issueTokens(user);
  }

  /**
   * Public self-registration. Creates ONLY the `User` — no `Company`
   * resolution, no `CompanyUser`/`Membership` write. A fresh registrant has
   * no company yet; company creation is a SEPARATE, AUTHENTICATED action
   * (`POST /companies`, `create-company.saga.ts`, design.md D7) — an
   * already-registered user provisions and becomes the OWNER of their own
   * company. This mirrors poolops-biz's `signUp()` (creates only `User`, no
   * `resolveSoleCompany` equivalent) — see engram
   * `reference/poolops-signup-company-split`. Duplicate `login` ->
   * `ConflictException` (409).
   */
  async signup(dto: SignupDto): Promise<SignupResponseDto> {
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const input: CreateUserInput = {
      login: dto.login,
      passwordHash,
      fullName: dto.fullName,
      email: dto.email,
      cellPhone: dto.cellPhone,
    };
    // Invariant check ONLY (mirrors CustomerService/createCustomer) — the
    // built entity is discarded; the repository/DB remains the single
    // source of truth for `id`/timestamps.
    createUser(input);

    let created: DomainUser;
    try {
      created = await this.userRepository.create(input);
    } catch (err) {
      if (err instanceof DuplicateLoginError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }

    return userToSignupResponseDto(created);
  }

  /**
   * Resolves the role bitmask backing a login/refresh response DTO. Same
   * fail-closed rule as `JwtStrategy`: a user with no ACTIVE assignment is
   * authenticated but not provisioned, which is a 403 and never a silent zero.
   */
  private async resolveRole(user: DomainUser): Promise<UserRoleValue> {
    const assignment = await this.companyUserRepository.findActiveByUserId(user.id);
    if (!assignment || assignment.status !== 'ACTIVE') {
      this.logger.error(
        `MISSING_COMPANY_USER: user ${user.id} has no ACTIVE CompanyUser assignment (status: ${assignment?.status ?? 'none'})`,
      );
      throw new ForbiddenException('User is not assigned to any company');
    }
    return assignment.role;
  }

  /**
   * Refresh rotation + reuse-detection — ported near-verbatim from
   * poolops-biz `apps/api-idp/src/auth/auth.service.ts:refreshAccessToken`
   * (lines 496-587), adapted to this project's port method names
   * (`findByToken`/`revokeIfActive`/`revokeByUserId`) and `login`-based
   * access-token payload (ADR-2). Steps (design.md §5):
   *  1. verify refresh JWT; reject wrong type/missing sub/rtid.
   *  2. `findByToken(rtid)`; reject if missing or wrong owner.
   *  3. reuse detection (expiry-independent): `isRevoked` -> revoke family, reject.
   *  4. expired-but-live -> reject.
   *  5. load user; reject if missing/inactive.
   *  6. atomic rotation: `revokeIfActive` returns 0 -> revoke family, reject (race/reuse).
   *  7. issue a fresh access+refresh pair.
   */
  async refresh(refreshToken: string): Promise<RefreshResponseDto> {
    let decoded: RefreshTokenPayload;
    try {
      // Cast bridges `RefreshTokenConfig.expiresIn: string` (env-var
      // friendly) against `jsonwebtoken`'s stricter `StringValue` type — see
      // the identical note in `auth.module.ts`.
      decoded = this.jwtService.verify<RefreshTokenPayload>(
        refreshToken,
        REFRESH_TOKEN_CONFIG as JwtVerifyOptions,
      );
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
    if (!decoded || decoded.type !== 'refresh' || !decoded.sub || !decoded.rtid) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const stored = await this.refreshTokenRepository.findByToken(decoded.rtid);
    if (!stored || stored.userId !== decoded.sub) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Reuse detection (expiry-independent): replaying an already-rotated
    // token signals theft -> revoke the WHOLE family and reject.
    if (stored.isRevoked) {
      await this.refreshTokenRepository.revokeByUserId(decoded.sub);
      throw new UnauthorizedException('Refresh token inválido');
    }

    // A live-but-expired token is simply invalid.
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const user = await this.userRepository.findById(decoded.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Atomic rotation: 0 rows affected means a concurrent request already
    // rotated this token (race/reuse) -> revoke the family and reject.
    const rotated = await this.refreshTokenRepository.revokeIfActive(stored.id);
    if (rotated === 0) {
      await this.refreshTokenRepository.revokeByUserId(decoded.sub);
      throw new UnauthorizedException('Refresh token inválido');
    }

    const tokens = await this.issueTokens(user);
    return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
  }

  /** Verifies the current password, rehashes, and REVOKES every refresh token for the user (design.md §5). */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    // SECURITY (FIX 4): dedicated `updatePassword` path — never the generic
    // `update` (which cannot touch `passwordHash` at all, by design).
    await this.userRepository.updatePassword(userId, passwordHash);
    await this.refreshTokenRepository.revokeByUserId(userId);
  }

  /**
   * Mints a single-use, 15-min opaque reset token. Enumeration-safe: ALWAYS
   * returns the SAME generic message shape regardless of whether `login`
   * matched a real, active account — the token is NEVER included in the
   * response (this endpoint is public/unauthenticated; echoing the token
   * would be an account-takeover oracle). Email delivery is deferred (no
   * `EmailService` in this repo, design.md §8 non-goal) — for dev/demo
   * visibility the token is logged server-side ONLY, never returned to the
   * caller.
   */
  async initiatePasswordReset(login: string): Promise<{ message: string }> {
    const user = await this.userRepository.findByLogin(login);
    if (!user || !user.isActive) {
      return { message: GENERIC_RESET_MESSAGE };
    }

    await this.passwordResetTokenRepository.revokeByUserId(user.id);
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);
    await this.passwordResetTokenRepository.create({ token, userId: user.id, expiresAt });

    // Dev-visibility only — never returned in the HTTP response.
    console.log(`[password-reset] token for login="${login}": ${token}`);

    return { message: GENERIC_RESET_MESSAGE };
  }

  /** Validates the reset token (not expired, not used), rehashes, marks the token used, and revokes all refresh tokens. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const resetToken = await this.passwordResetTokenRepository.findByToken(token);
    if (!resetToken || resetToken.isUsed || resetToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Token de restablecimiento inválido o expirado');
    }

    const user = await this.userRepository.findById(resetToken.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Token de restablecimiento inválido o expirado');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    // SECURITY (FIX 4): dedicated `updatePassword` path.
    await this.userRepository.updatePassword(user.id, passwordHash);
    await this.passwordResetTokenRepository.markAsUsed(resetToken.id);
    await this.refreshTokenRepository.revokeByUserId(user.id);
  }

  private async issueTokens(user: DomainUser): Promise<LoginResponseDto> {
    const accessPayload: JwtAccessPayload = { sub: user.id, login: user.login };
    const accessToken = this.jwtService.sign(accessPayload);

    const rtid = randomBytes(32).toString('hex');
    const refreshPayload: RefreshTokenPayload = { sub: user.id, type: 'refresh', rtid };
    const refreshToken = this.jwtService.sign(refreshPayload, REFRESH_TOKEN_CONFIG as JwtSignOptions);

    const expiresAt = new Date(Date.now() + parseRefreshTtlMs());
    await this.refreshTokenRepository.create({ token: rtid, userId: user.id, expiresAt });

    // The login/refresh response carries the same `roles` field the rest of the
    // API reports, so it must come from the CompanyUser assignment too — this
    // call site was NOT in the design's inventory of six, it is the seventh.
    const roles = await this.resolveRole(user);

    return { accessToken, refreshToken, user: userToResponseDto(user, roles) };
  }
}

/** Parses `REFRESH_TOKEN_CONFIG.expiresIn` (e.g. `'7d'`) into milliseconds for the persisted `expiresAt`. Only `d`/`h`/`m` suffixes are supported (matches this project's env defaults). */
function parseRefreshTtlMs(): number {
  const raw = REFRESH_TOKEN_CONFIG.expiresIn;
  const match = /^(\d+)([dhm])$/.exec(raw);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // fallback: 7 days
  const value = Number(match[1]);
  const unit = match[2];
  const unitMs = unit === 'd' ? 86_400_000 : unit === 'h' ? 3_600_000 : 60_000;
  return value * unitMs;
}
