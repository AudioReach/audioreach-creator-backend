/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

const {RuleTester} = require('eslint');
const rule = require('../no-manual-status-codes.cjs');

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

ruleTester.run('no-manual-status-codes', rule, {
  valid: [
    // Success codes are allowed
    'res.status(200).json(data);',
    'res.status(201).json(created);',
    'res.status(204).send();',
    // Non-controller files are ignored
    {
      code: 'res.status(404).json({ error: "Not found" });',
      filename: 'packages/core/src/application/service.ts',
    },
  ],
  invalid: [
    {
      code: 'res.status(404).json({ error: "Not found" });',
      filename: 'packages/api/src/presentation/ProjectController.ts',
      errors: [{messageId: 'manualStatusCode'}],
    },
    {
      code: 'res.status(400).json({ error: "Bad request" });',
      filename: 'packages/api/src/presentation/DefinitionsController.ts',
      errors: [{messageId: 'manualStatusCode'}],
    },
    {
      code: 'res.status(500).json({ error: "Server error" });',
      filename: 'packages/api/src/presentation/GraphController.ts',
      errors: [{messageId: 'manualStatusCode'}],
    },
    {
      code: 'function handler() { return res.status(409).json({ error: "Conflict" }); }',
      filename: 'packages/api/src/presentation/ModuleController.ts',
      errors: [{messageId: 'manualStatusCode'}],
    },
  ],
});
