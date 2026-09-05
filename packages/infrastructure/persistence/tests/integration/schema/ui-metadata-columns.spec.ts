/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../helpers/test-database-setup.js';

describe('ui-metadata DB columns', () => {
  beforeAll(setupIntegrationTest);
  afterAll(teardownIntegrationTest);
  beforeEach(setupEachTest);

  it('subsystems table should have a subsystem_id column', async () => {
    const ds = getTestDataSource();
    const rows = await ds.query(`PRAGMA table_info("subsystems")`);
    const cols = rows.map((r: {name: string}) => r.name);
    expect(cols).toContain('subsystem_id');
  });

  it('subsystem_filtered_keys_key_definition join table should exist', async () => {
    const ds = getTestDataSource();
    const rows = await ds.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='subsystem_filtered_keys_key_definition'`,
    );
    expect(rows).toHaveLength(1);
  });
});
