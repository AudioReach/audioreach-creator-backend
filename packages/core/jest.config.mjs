export default {
  // Use ES modules preset for ts-jest
  preset: 'ts-jest/presets/default-esm',

  // Use projects to run different test types separately
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest/presets/default-esm',
      testEnvironment: 'node',
      roots: ['<rootDir>'],
      testMatch: ['**/tests/unit/**/*.spec.ts'],
      extensionsToTreatAsEsm: ['.ts'],
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
      coverageReporters: ['html', 'json'],
      coveragePathIgnorePatterns: ['/node_modules/', '/tests/', 'src/index.ts'],
    },
    {
      displayName: 'integration',
      preset: 'ts-jest/presets/default-esm',
      testEnvironment: 'node',
      roots: ['<rootDir>'],
      testMatch: ['**/tests/integration/**/*.spec.ts'],
      extensionsToTreatAsEsm: ['.ts'],
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
      coverageReporters: ['html', 'json'],
      coveragePathIgnorePatterns: ['/node_modules/', '/tests/', 'src/index.ts'],
    },
  ],

  // Global reporters for all projects - merged XML output
  reporters: [
    [
      'default',
      {
        summaryThreshold: 0, // Always show summary
      },
    ],
    [
      'jest-junit',
      {
        outputDirectory: './test-results',
        outputName: 'merged-results.xml',
        suiteName: 'Core All Tests',
      },
    ],
  ],

  // Show only failures and summary
  verbose: false,
  silent: true,
  bail: false,
  errorOnDeprecated: false,
};
