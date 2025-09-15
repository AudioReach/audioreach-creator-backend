import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import nodePlugin from 'eslint-plugin-n';
import securityPlugin from 'eslint-plugin-security';
import sonarjsPlugin from 'eslint-plugin-sonarjs';
import unicornPlugin from 'eslint-plugin-unicorn';
import promisePlugin from 'eslint-plugin-promise';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.tsbuildinfo',
      '**/coverage/**',
      '**/.yarn/**',
      '**/build/**',
      'eslint.config.js',
      '**/jest.config.js',
      '**/jest.config.ts',
      '**/jest.*.js',
    ],
  },
  // Base configurations
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // Plugin recommended configurations
  importPlugin.flatConfigs.recommended,
  nodePlugin.configs['flat/recommended'],
  securityPlugin.configs.recommended,
  sonarjsPlugin.configs.recommended,
  unicornPlugin.configs['recommended'],
  promisePlugin.configs['flat/recommended'],

  // Main configuration
  {
    files: ['**/*.{js,ts,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: 'module',
        project: [
          './tsconfig.json',
          './packages/*/tsconfig.json',
          './packages/*/tsconfig.test.json',
        ],
        tsconfigRootDir: '.',
      },
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: [
            './tsconfig.json',
            './packages/*/tsconfig.json',
            './packages/*/tsconfig.test.json',
          ],
        },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
        },
      },
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
      },
    },
  },

  // Test files configuration
  {
    files: [
      '**/*.spec.ts',
      '**/*.test.ts',
      '**/test/**/*.ts',
      '**/tests/**/*.ts',
    ],
    rules: {
      // TypeScript strict rules - relaxed for testing
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',

      // SonarJS rules - relaxed for testing
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-useless-catch': 'off',

      // Unicorn rules - relaxed for testing
      'unicorn/no-array-for-each': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prevent-abbreviations': 'off',

      // Security and other rules
      'security/detect-object-injection': 'off',
      'no-console': 'off',
      'no-useless-catch': 'off',
    },
  },

  // Configuration files
  {
    files: ['*.config.{js,ts}', '*.conf.{js,ts}'],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      'import/no-default-export': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  // Main entry files
  {
    files: ['**/main.ts', '**/index.ts'],
    rules: {
      'unicorn/no-process-exit': 'off',
      'n/no-process-exit': 'off',
    },
  },

  // TypeScript-specific rules
  {
    files: ['**/*.ts'],
    rules: {
      // Disabled: Node plugin doesn't understand TypeScript imports. Using import/no-unresolved instead.
      'n/no-missing-import': 'off',
      // Disabled: Too many false positives for safe array access patterns used by major style guides
      'security/detect-object-injection': 'off',
      // Disabled: Allow TODO comments in development/placeholder code
      'sonarjs/todo-tag': 'off',
      // Configure unused vars to ignore parameters/variables prefixed with underscore
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Orchestration infrastructure files - allow 'any' type for CQRS framework code
  {
    files: ['**/orchestration/**/*.ts'],
    rules: {
      // Disabled: Infrastructure code needs flexible typing for dynamic handler creation
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Prettier integration - must be last
  prettierConfig,
];
