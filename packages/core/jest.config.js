module.exports = {
  // Use projects to run different test types separately
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      roots: ['<rootDir>'],
      moduleFileExtensions: ['ts', 'js', 'json'],
      testMatch: ['**/tests/Unit/**/*.spec.(ts|js)'],
      transform: {
        '^.+\\.(t|j)s$': 'ts-jest'
      },
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/index.ts'
      ],
      coverageDirectory: './coverage',
      coverageReporters: ['html', 'json'],
      coveragePathIgnorePatterns: [
        '/node_modules/',
        '/tests/',
        'src/index.ts'
      ]
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      roots: ['<rootDir>'],
      moduleFileExtensions: ['ts', 'js', 'json'],
      testMatch: ['**/tests/Integration/**/*.spec.(ts|js)'],
      transform: {
        '^.+\\.(t|j)s$': 'ts-jest'
      },
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/index.ts'
      ],
      coverageDirectory: './coverage',
      coverageReporters: ['html', 'json'],
      coveragePathIgnorePatterns: [
        '/node_modules/',
        '/tests/',
        'src/index.ts'
      ]
    }
  ],
  // Global reporters for all projects - merged XML output
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: './test-results',
      outputName: 'merged-results.xml',
      suiteName: 'Core All Tests'
    }]
  ]
};
