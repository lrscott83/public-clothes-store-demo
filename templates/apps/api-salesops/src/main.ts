import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  SCHEMA_CURRENCY_ENV,
  reportTenantSchemaCurrency,
  resolveSchemaCurrencyMode,
} from '@store-mgmt/infra-db';
import { AppModule } from './app.module.js';

/**
 * Tenant schemas evolve ONLY through a manual, out-of-band
 * `node scripts/tenant-migrate.ts` (design D6). A build that depends on new
 * DDL used to start happily and then 500 at runtime on an endpoint with
 * nothing to do with the new feature — `DeliveryAssignmentStatus.cancelled`
 * turned `POST /orders/:id/cancel` into a 500 for EVERY order in an
 * un-migrated tenant.
 *
 * THIS CALL IS A REPORT, NOT A GATE, and that is the correction. The previous
 * version ran the same probe with `enforce` as the DEFAULT and
 * `process.exit(1)` as the consequence, over EVERY `store_mgmt_tenant_%`
 * schema in the database with no scoping. So a gap in ONE tenant refused boot
 * for ALL of them — a company-wide outage in answer to one endpoint failing
 * in one tenant, and reachable by an ordinary rolling deploy: `api-idp` is a
 * separate deployable that provisions tenant schemas at runtime from its own
 * image's bundled `prisma/tenant-schema.sql`, so while it lags this app, one
 * company signup is enough to make the next restart or scale-up refuse to
 * boot. A `refused-destructive` tenant, a restored-from-backup schema and an
 * orphan schema all do the same.
 *
 * The GATE now lives in `TenantContextGuard`, per request, keyed on the
 * request's own schema: at `TENANT_SCHEMA_DRIFT_CHECK=enforce` a stale tenant
 * gets 503 on its OWN requests and every other tenant keeps serving. That
 * also covers tenants provisioned AFTER this process started, which a
 * boot-only probe never saw.
 *
 * `warn` is the default here; `=off` skips the probe entirely; an
 * unrecognised value is REFUSED at boot (`resolveSchemaCurrencyMode` throws)
 * rather than silently resolving to the strictest mode, which is what turned
 * a typo'd escape hatch into the outage it was typed to avoid.
 */
async function bootstrap(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const mode = resolveSchemaCurrencyMode(process.env[SCHEMA_CURRENCY_ENV]);
  if (connectionString) {
    await reportTenantSchemaCurrency({ connectionString, mode });
  } else if (mode !== 'off') {
    console.warn(
      `DATABASE_URL is not set — skipping the tenant schema drift probe (${SCHEMA_CURRENCY_ENV}=${mode}).`,
    );
  }

  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`api-salesops listening on port ${port}`);
}

// A bare `void bootstrap()` turns ANY startup failure — an unusable
// `TENANT_SCHEMA_DRIFT_CHECK` value, a DI resolution error, a port already in
// use — into an unhandled
// rejection. Node's default for those is a non-zero exit with a stack trace,
// but that default is configurable (`--unhandled-rejections=warn`) and, either
// way, the process would be reported as having died for no stated reason.
// Naming the failure and exiting deliberately is what makes a crash-looping
// container diagnosable from its logs alone.
bootstrap().catch((err: unknown) => {
  console.error('api-salesops failed to start:', err);
  process.exit(1);
});
