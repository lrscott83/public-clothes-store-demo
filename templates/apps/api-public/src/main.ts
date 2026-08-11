import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

/**
 * Bare Phase-0 scaffold (spike 0.1a): boots `AppModule` with only
 * `HealthModule` wired in. No tenant resolution, no product endpoints — see
 * design.md §4's file map for what lands in later phases.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3003;
  await app.listen(port);
  console.log(`api-public listening on port ${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error('api-public failed to start:', err);
  process.exit(1);
});
