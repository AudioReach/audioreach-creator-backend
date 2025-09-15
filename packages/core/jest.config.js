module.exports = {
  // Use projects to run different test types separately
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      roots: ['<rootDir>'],
      moduleFileExtensions: ['ts', 'js', 'json'],
      testMatch: ['**/tests/unit/**/*.spec.(ts|js)'],
      transform: {
        '^.+\\.(t|j)s$': [
          'ts-jest',
          {
            tsconfig: './tsconfig.test.json',
          },
        ],
      },
      moduleNameMapper: {
        '^@domain/(.*)$': '<rootDir>/src/domain/$1',
        '^@application/(.*)$': '<rootDir>/src/application/$1',
        '^@shared/(.*)$': '<rootDir>/src/shared/$1',
        '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
      },
      collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
      coverageDirectory: './coverage',
      coverageReporters: ['html', 'json'],
      coveragePathIgnorePatterns: ['/node_modules/', '/tests/', 'src/index.ts'],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      roots: ['<rootDir>'],
      moduleFileExtensions: ['ts', 'js', 'json'],
      testMatch: ['**/tests/integration/**/*.spec.(ts|js)'],
      transform: {
        '^.+\\.(t|j)s$': [
          'ts-jest',
          {
            tsconfig: './tsconfig.test.json',
          },
        ],
      },
      moduleNameMapper: {
        '^@domain/(.*)$': '<rootDir>/src/domain/$1',
        '^@application/(.*)$': '<rootDir>/src/application/$1',
        '^@shared/(.*)$': '<rootDir>/src/shared/$1',
        '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
      },
      collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
      coverageDirectory: './coverage',
      coverageReporters: ['html', 'json'],
      coveragePathIgnorePatterns: ['/node_modules/', '/tests/', 'src/index.ts'],
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
        suiteName: 'Core All Tests',
      },
    ],
  ],
};
