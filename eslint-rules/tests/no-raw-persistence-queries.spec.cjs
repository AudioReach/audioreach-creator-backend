/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

const {RuleTester} = require('eslint');
const rule = require('../no-raw-persistence-queries.cjs');

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
});

ruleTester.run('no-raw-persistence-queries', rule, {
  valid: [
    // .query() in a non-persistence file is fine
    {
      code: 'manager.query("SELECT 1");',
      filename: 'packages/api/src/presentation/rest/controller.ts',
    },
    // manager.insert() in a persistence file is fine
    {
      code: 'this.manager.insert(FooSchema, rows);',
      filename:
        'packages/infrastructure/persistence/src/repositories/bulk-import/foo.inserter.ts',
    },
    // dataSource.query() in a test file is excluded via custom pattern
    {
      code: 'dataSource.query("SELECT * FROM foo");',
      filename:
        'packages/infrastructure/persistence/tests/integration/foo.spec.ts',
      options: [{persistencePattern: 'persistence/src'}],
    },
  ],
  invalid: [
    // manager.query() in a persistence source file
    {
      code: 'manager.query("SELECT 1");',
      filename:
        'packages/infrastructure/persistence/src/repositories/bulk-import/foo.inserter.ts',
      errors: [{messageId: 'noRawPersistenceQuery'}],
    },
    // this.manager.query() in an inserter
    {
      code: 'this.manager.query(`INSERT OR IGNORE INTO foo VALUES (?,?)`, [1, 2]);',
      filename:
        'packages/infrastructure/persistence/src/repositories/bulk-import/subsystem/subsystem.inserter.ts',
      errors: [{messageId: 'noRawPersistenceQuery'}],
    },
  ],
});

console.log('no-raw-persistence-queries: all tests passed');
