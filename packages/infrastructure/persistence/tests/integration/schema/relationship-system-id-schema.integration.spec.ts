/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  getTestDataSource,
  setupIntegrationTest,
  teardownIntegrationTest,
} from '../helpers/test-database-setup.js';

const RELATIONSHIP_KEYS = {
  CkvValues: ['ckvSystemId', 'valueDefSystemId'],
  TkvValues: ['tkvSystemId', 'valueDefSystemId'],
  DkvValues: ['dkvSystemId', 'valueDefSystemId'],
  SgkvValues: ['sgkvSystemId', 'valueDefSystemId'],
  VcpmCkvValues: ['vcpmCkvSystemId', 'valueDefSystemId'],
  UsecaseGkvValues: ['usecaseSystemId', 'valueDefSystemId'],
  SubsystemFilteredKey: ['subsystemsSystemId', 'keyDefinitionSystemId'],
  UseCaseCategoryJoin: ['useCaseSystemId', 'categorySystemId'],
  ModuleDefinitionContainerTypeLink: [
    'moduleDefinitionSystemId',
    'containerTypeSystemId',
  ],
  ModuleDefinitionProcessorLink: [
    'moduleDefinitionSystemId',
    'processorDefinitionSystemId',
  ],
} as const;

const MANAGED_COLUMNS = ['version'];

describe('relationship schemas with synthetic system IDs', () => {
  beforeAll(async () => {
    await setupIntegrationTest();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  it.each(Object.entries(RELATIONSHIP_KEYS))(
    '%s uses systemId as its sole primary key, preserves its natural key, and has managed columns',
    (entityName, naturalKey) => {
      const metadata = getTestDataSource().getMetadata(entityName);

      expect(
        metadata.primaryColumns.map(column => column.propertyName),
      ).toEqual(['systemId']);
      expect(
        metadata.indices.some(
          index =>
            index.isUnique &&
            naturalKey.every(key =>
              index.columns.some(column => column.propertyName === key),
            ),
        ),
      ).toBe(true);
      expect(
        MANAGED_COLUMNS.every(column =>
          metadata.columns.some(
            metadataColumn => metadataColumn.propertyName === column,
          ),
        ),
      ).toBe(true);
    },
  );

  it('keeps SessionEntityVersion composite-keyed', () => {
    const metadata = getTestDataSource().getMetadata('SessionEntityVersion');

    expect(metadata.primaryColumns.map(column => column.propertyName)).toEqual([
      'sessionId',
      'targetTable',
      'targetSystemId',
    ]);
  });
});
