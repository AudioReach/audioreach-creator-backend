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
      collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
      coverageDirectory: './coverage',
      coverageReporters: ['html', 'json'],
      coveragePathIgnorePatterns: ['/node_modules/', '/tests/', 'src/main.ts'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
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
      resolver: 'jest-ts-webcompat-resolver',
      collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
      coverageDirectory: './coverage',
      coverageReporters: ['html', 'json'],
      coveragePathIgnorePatterns: ['/node_modules/', '/tests/', 'src/main.ts'],
    },
    {
      displayName: 'e2e',
      preset: 'ts-jest/presets/default-esm',
      testEnvironment: 'node',
      extensionsToTreatAsEsm: ['.ts'],
      roots: ['<rootDir>'],
      testMatch: ['**/tests/e2e/**/*.e2e-spec.ts'],
      testTimeout: 120000,
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
      collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
      coverageDirectory: './coverage',
      coverageReporters: ['html', 'json'],
      coveragePathIgnorePatterns: ['/node_modules/', '/tests/', 'src/main.ts'],
    },
  ],
  // Global reporters for all projects - merged XML output
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: './test-results',
        outputName: 'merged-results.xml',
        suiteName: 'API All Tests',
      },
    ],
  ],

  // Suppress console output during tests (only show errors)
  silent: true,
};
