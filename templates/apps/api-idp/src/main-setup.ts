import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';

/**
 * Global request-validation pipe (SECURITY FIX 4 — mass-assignment guard).
 * `whitelist: true` strips unknown properties; `forbidNonWhitelisted: true`
 * rejects the request outright (400) instead of silently stripping —
 * surfaces the bug to the caller rather than masking it. `transform: true`
 * lets `@Type(...)`/implicit primitive coercion run for path/query params.
 * Exported so both `main.ts` (bootstrap) and e2e specs (`Test.createTestingModule`,
 * which does NOT run `main.ts`) apply the IDENTICAL pipe config.
 */
export function installGlobalPipes(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
