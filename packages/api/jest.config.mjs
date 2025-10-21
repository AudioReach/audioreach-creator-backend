export default {
  // Use ES modules preset for ts-jest
  preset: 'ts-jest/presets/default-esm',
  
  // Treat .ts files as ES modules
  extensionsToTreatAsEsm: ['.ts'],

  // Use projects to run different test types separately
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
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
      resolver: 'jest-ts-webcompat-resolver',
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/main.ts'
      ],
      coverageDirectory: './coverage',
      coverageReporters: ['html', 'json'],
      coveragePathIgnorePatterns: [
        '/node_modules/',
        '/tests/',
        'src/main.ts'
      ]
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
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/main.ts'
      ],
      coverageDirectory: './coverage',
      coverageReporters: ['html', 'json'],
      coveragePathIgnorePatterns: [
        '/node_modules/',
        '/tests/',
        'src/main.ts'
      ]
    },
    {
      displayName: 'e2e',
      testEnvironment: 'node',
      roots: ['<rootDir>'],
      testMatch: ['**/tests/e2e/**/*.e2e-spec.ts'],
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
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/main.ts'
      ],
      coverageDirectory: './coverage',
      coverageReporters: ['html', 'json'],
      coveragePathIgnorePatterns: [
        '/node_modules/',
        '/tests/',
        'src/main.ts'
      ]
    }
  ],
  // Global reporters for all projects - merged XML output
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: './test-results',
      outputName: 'merged-results.xml',
      suiteName: 'API All Tests'
    }]
  ]
};
