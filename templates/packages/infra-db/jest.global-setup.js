// Runs ONCE, before any suite, against the dedicated test database.
//
// Every spec cleans up after itself, but nothing protected the run from state
// that arrived BEFORE it started: a seed script run by hand, a previous run
// killed halfway, a fixture whose suite died before its teardown. That state
// used to surface later as a foreign-key error inside an unrelated spec, which
// reads as flakiness and costs an afternoon to trace.
//
// The table list is read from the database rather than written here on purpose:
// a hand-written list is exactly what went stale three times in this package.
// TRUNCATE ... CASCADE ignores RESTRICT, which is correct HERE and only here —
// this is the one place whose job is to leave nothing behind.
const path = require('path');
const fs = require('fs');
const { Client } = require('pg');

module.exports = async function globalSetup() {
  // This hook runs in plain Node, OUTSIDE jest's sandbox, so it never sees the
  // `.env` that `jest.setup.js` parses for the suites. Load it here too —
  // `process.loadEnvFile` works fine out here; it is only inside the vm realm
  // that it silently does nothing.
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }

  const url =
    process.env.TEST_URL ??
    'postgresql://postgres:postgres@172.17.0.1:5432/store_mgmt_test?schema=public';

  // Refuse to touch anything but the test database. A misconfigured TEST_URL
  // must fail the run, never wipe development data.
  if (!url.includes('store_mgmt_test')) {
    throw new Error(
      `Refusing to truncate: TEST_URL does not point at store_mgmt_test (got ${url.replace(/:\/\/[^@]*@/, '://***@')})`,
    );
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (rows.length > 0) {
      const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
      await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
};
