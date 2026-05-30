/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

const {RuleTester} = require('eslint');
const rule = require('../enforce-http-exceptions.cjs');

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

ruleTester.run('enforce-http-exceptions', rule, {
  valid: [
    // HTTP exceptions are allowed
    {
      code: 'throw new BadRequestException("Invalid input");',
      filename: 'packages/api/src/presentation/ProjectController.ts',
    },
    {
      code: 'throw new NotFoundException("Project", id);',
      filename: 'packages/api/src/presentation/DefinitionsController.ts',
    },
    // Generic errors in non-controller files are allowed
    {
      code: 'throw new Error("Something failed");',
      filename: 'packages/core/src/application/GetProjectUseCase.ts',
    },
  ],
  invalid: [
    {
      code: 'throw new Error("ID required");',
      filename: 'packages/api/src/presentation/ProjectController.ts',
      errors: [{messageId: 'genericError'}],
    },
    {
      code: 'throw new TypeError("Invalid type");',
      filename: 'packages/api/src/presentation/DefinitionsController.ts',
      errors: [{messageId: 'genericError'}],
    },
  ],
});
