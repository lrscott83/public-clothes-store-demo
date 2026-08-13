/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  setupFiles: ['<rootDir>/../jest.setup.js'],
  // Empties the test database ONCE before the run. Per-spec teardown handles
  // contamination BETWEEN suites; this handles what arrives before the run even
  // starts — a hand-run seed, a previous run that was killed. See the file.
  globalSetup: '<rootDir>/../jest.global-setup.js',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!**/index.ts', '!**/*.module.ts', '!**/main.ts'],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: {
      statements: 94,
      branches: 76,
      functions: 94,
      lines: 94,
    },
  },
  // Every spec here is a REAL-Postgres integration test against ONE shared
  // database, and several fixture helpers across files reuse the exact same
  // natural keys (e.g. category slug "cafeteras"). Jest's default parallel
  // workers each open their own PrismaService against that same DB, so two
  // suites' create/afterEach-truncate steps can interleave and race (unique
  // constraint violations, FK violations from a concurrent deleteMany).
  // Discovered in backend-ventas Phase 4 once `prisma-order.repository.spec.ts`
  // (heavier fixtures, longer-lived transactions) added enough overlap to
  // trigger it. Forcing a single worker makes suites run strictly
  // sequentially — the only execution mode that was ever actually safe for
  // this shared-DB setup.
  maxWorkers: 1,
};
