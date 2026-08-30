export default {
  // Use ES modules preset for ts-jest
  preset: 'ts-jest/presets/default-esm',

  // Treat .ts files as ES modules
  extensionsToTreatAsEsm: ['.ts'],

  // Use projects to run different test types separately
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest/presets/default-esm',
      testEnvironment: 'node',
      extensionsToTreatAsEsm: ['.ts'],
      roots: ['<rootDir>'],
      testMatch: ['**/tests/unit/**/*.spec.ts'],
      transform: {
        '^.+\\.(t|j)s$': [
          'ts-jest',
          {
            tsconfig: './tsconfig.test.json',
            useESM: true,
          },
        ],
      },
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      resolver: 'jest-ts-webcompat-resolver',
      collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
      coverageDirectory: './coverage',
      coveragePathIgnorePatterns: ['/node_modules/', '/tests/', 'src/index.ts'],
    },
    {
      displayName: 'integration',
      preset: 'ts-jest/presets/default-esm',
      testEnvironment: 'node',
      extensionsToTreatAsEsm: ['.ts'],
      roots: ['<rootDir>'],
      testMatch: ['**/tests/integration/**/*.spec.ts'],
      transform: {
        '^.+\\.(t|j)s$': [
          'ts-jest',
          {
            tsconfig: './tsconfig.test.json',
            useESM: true,
          },
        ],
      },
      moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      resolver: 'jest-ts-webcompat-resolver',
      collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
      coverageDirectory: './coverage',
      coveragePathIgnorePatterns: ['/node_modules/', '/tests/', 'src/index.ts'],
    },
  ],

  coverageReporters: ['html', 'json'],
  testTimeout: 30_000,

  // Global reporters for all projects - merged XML output
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: './test-results',
        outputName: 'merged-results.xml',
        suiteName: 'Persistence Integration Tests',
      },
    ],
  ],

  // Suppress console output during tests (only show errors)
  silent: true,
};
