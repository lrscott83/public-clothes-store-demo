/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
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
      statements: 93,
      branches: 58,
      functions: 91,
      lines: 96,
    },
  },
};
