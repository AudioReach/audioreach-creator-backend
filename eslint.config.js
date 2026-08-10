/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import nodePlugin from 'eslint-plugin-n';
import securityPlugin from 'eslint-plugin-security';
import sonarjsPlugin from 'eslint-plugin-sonarjs';
import unicornPlugin from 'eslint-plugin-unicorn';
import promisePlugin from 'eslint-plugin-promise';
import prettierConfig from 'eslint-config-prettier';
import customRules from './eslint-rules/index.js';

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
      'eslint-rules/**',
      '**/jest.config.js',
      '**/jest.config.mjs',
      '**/jest.config.ts',
      '**/jest.*.js',
      '**/jest.*.mjs',
      'packages/api/scripts/typeorm-cli.cjs',
      // Test files
      '**/*.spec.ts',
      '**/*.test.ts',
      '**/tests/**',
      '**/test/**',
      // Scripts
      'scripts/**',
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
    plugins: {
      custom: customRules,
    },
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
          './packages/core/tsconfig.eslint.json',
          './packages/infrastructure/fs/tsconfig.eslint.json',
          './packages/infrastructure/persistence/tsconfig.eslint.json',
          './packages/api/tsconfig.eslint.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: [
            './packages/core/tsconfig.eslint.json',
            './packages/infrastructure/fs/tsconfig.eslint.json',
            './packages/infrastructure/persistence/tsconfig.eslint.json',
            './packages/api/tsconfig.eslint.json',
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
    rules: {
      'custom/no-banned-keywords': 'error',
      'custom/no-api-property-example': 'error',
      'custom/enforce-createzodto-naming': 'error',

      // Error handling enforcement rules
      'custom/no-manual-status-codes': [
        'error',
        {
          allowedSuccessCodes: [200, 201, 204, 207],
          controllerPattern: '**/packages/api/src/presentation/**/*.ts',
        },
      ],

      'custom/no-controller-try-catch': [
        'error',
        {
          controllerPattern: '**/packages/api/src/presentation/**/*.ts',
        },
      ],

      'custom/enforce-http-exceptions': [
        'error',
        {
          controllerPattern: '**/packages/api/src/presentation/**/*.ts',
          allowedExceptions: [
            'BadRequestException',
            'NotFoundException',
            'UnauthorizedException',
            'ForbiddenException',
            'ConflictException',
            'ValidationException',
            'InternalServerErrorException',
            'NotImplementedException',
            'UnprocessableEntityException',
          ],
        },
      ],

      'custom/no-domain-infrastructure-deps': [
        'error',
        {
          domainPattern: '**/packages/core/src/domain/**/*.ts',
          bannedImports: [
            '**/infrastructure/**',
            '**/api/**',
            'typeorm',
            'express',
          ],
        },
      ],

      'custom/no-raw-persistence-queries': [
        'error',
        {
          persistencePattern: 'persistence',
        },
      ],
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

  // Main entry files and CLI scripts
  {
    files: ['**/main.ts', '**/index.ts', '**/scripts/**/*.ts'],
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
      // Disabled: Allow abbreviations in variable names for better readability
      'unicorn/prevent-abbreviations': 'off',
      // Disabled: Switch case braces are not required for our codebase style
      'unicorn/switch-case-braces': 'off',
      // Disabled: Prefer explicit if-else over ternary for better readability
      'unicorn/prefer-ternary': 'off',
      // Disabled: TypeError should only be used for JavaScript type errors, not data validation errors
      'unicorn/prefer-type-error': 'off',
      // Disabled: Allow null where it has semantic meaning (e.g., database NULL, explicit absence)
      'unicorn/no-null': 'off',
      // Disabled: Negated conditions are often clearer for early-return guard patterns
      'unicorn/no-negated-condition': 'off',
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
      // Disabled: CQRS infrastructure code needs flexible typing for dynamic handler creation and dispatch
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  // Entity schema files - allow unsafe assignment and explicit any for TypeORM schema definitions
  {
    files: ['**/entity-schema/**/*.ts'],
    rules: {
      // Disabled: TypeORM entity schemas require flexible typing for database column definitions
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // Disabled: TypeORM transformers and schema definitions need explicit any for type flexibility
      '@typescript-eslint/no-explicit-any': 'off',
      // Disabled: TypeORM transformers need to return any type for database compatibility
      '@typescript-eslint/no-unsafe-return': 'off',
      // Disabled: Allow unknown types in template literals for error logging
      '@typescript-eslint/restrict-template-expressions': 'off',
      // Disabled: TypeORM entity schemas often use unsafe operations for data transformation
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // Disabled: Type assertions are necessary for TypeORM's dynamic typing with unknown values
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      // Disabled: Pure utility functions are safe to pass as unbound methods
      '@typescript-eslint/unbound-method': 'off',
      // Disabled: Allow null in database schemas where it's semantically correct
      'unicorn/no-null': 'off',
      // Disabled: Allow crypto import without node: protocol for compatibility
      'unicorn/prefer-node-protocol': 'off',
      // Disabled: Allow static-only classes for utility purposes in database schemas
      'unicorn/no-static-only-class': 'off',
    },
  },

  // Database infrastructure files - allow null for database semantics
  {
    files: [
      '**/infrastructure-wrapper/database/**/*data-source-provider.ts',
      '**/infrastructure-wrapper/database/**/node-blob-converter.ts',
      '**/infrastructure-wrapper/persistence/**/typeorm-unit-of-work.ts',
    ],
    rules: {
      // Disabled: null is semantically correct for database NULL values and singleton patterns
      'unicorn/no-null': 'off',
    },
  },

  // TypeORM migrations use raw queryRunner.query() by design
  {
    files: ['**/migrations/**/*.ts'],
    rules: {
      'custom/no-raw-persistence-queries': 'off',
    },
  },

  // Swagger documentation files - allow dynamic file system operations
  {
    files: ['**/presentation/rest/common/swagger-doc/**/*.ts'],
    rules: {
      // Disabled: Swagger generation may require file system operations with dynamic paths
      'security/detect-non-literal-fs-filename': 'off',
    },
  },

  // File system infrastructure files - allow dynamic file system operations
  {
    files: ['**/*.ts'],
    rules: {
      // Disabled: File system adapter requires dynamic paths from function parameters
      'security/detect-non-literal-fs-filename': 'off',
    },
  },

  // Prettier integration - must be last
  prettierConfig,
];
