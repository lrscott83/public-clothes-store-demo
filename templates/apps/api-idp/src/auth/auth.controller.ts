import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DuplicateLoginError, InvalidUserError, type User as DomainUser } from '@store-mgmt/domain';
import { JwtAuthGuard } from '@store-mgmt/api-common';
import { AuthService } from './auth.service.js';
import type { LoginResponseDto, RefreshResponseDto, UserResponseDto } from './dto/index.js';
// SECURITY (FIX 4): value imports (NOT `import type`) — the global
// `ValidationPipe` needs the real class at runtime via `design:paramtypes`
// for every DTO bound with `@Body()`; a type-only import erases the class
// and Nest silently skips validation/whitelisting for that parameter.
import {
  ChangePasswordDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RefreshDto,
  SignupDto,
} from './dto/index.js';
import { LocalAuthGuard } from './local-auth.guard.js';

interface AuthenticatedRequest extends Request {
  user: DomainUser;
}

/**
 * Auth delivery — the ONLY app that owns `LocalStrategy` (design.md §7
 * ADR-1). `login` uses `LocalAuthGuard` (delegates to
 * `AuthService.validateUser`); `change-password` requires `JwtAuthGuard`
 * (from `@store-mgmt/api-common`, ADR-3).
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  async login(@Req() req: AuthenticatedRequest): Promise<LoginResponseDto> {
    return this.authService.login(req.user);
  }

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(@Body() body: SignupDto): Promise<UserResponseDto> {
    return this.withDomainErrorMapping(() => this.authService.signup(body));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() body: RefreshDto): Promise<RefreshResponseDto> {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() body: ChangePasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.changePassword(req.user.id, body.currentPassword, body.newPassword);
    return { message: 'Contraseña actualizada correctamente.' };
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(@Body() body: PasswordResetRequestDto): Promise<{ message: string }> {
    return this.authService.initiatePasswordReset(body.login);
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(@Body() body: PasswordResetConfirmDto): Promise<{ message: string }> {
    await this.authService.resetPassword(body.token, body.newPassword);
    return { message: 'Contraseña restablecida correctamente.' };
  }

  private async withDomainErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidUserError) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof DuplicateLoginError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
