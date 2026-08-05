export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
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
      coverageReporters: ['html', 'json'],
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
      coverageReporters: ['html', 'json'],
      coveragePathIgnorePatterns: ['/node_modules/', '/tests/', 'src/index.ts'],
    },
  ],

  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: './test-results',
        outputName: 'merged-results.xml',
        suiteName: 'Logger Unit Tests',
      },
    ],
  ],

  silent: true,
};
