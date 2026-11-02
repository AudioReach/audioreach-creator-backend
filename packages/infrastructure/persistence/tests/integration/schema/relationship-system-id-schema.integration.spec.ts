/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  getTestDataSource,
  setupIntegrationTest,
  teardownIntegrationTest,
} from '../helpers/test-database-setup.js';

const RELATIONSHIP_SCHEMAS = [
  ['CkvValues', ['ckvSystemId', 'valueDefSystemId'], false],
  ['TkvValues', ['tkvSystemId', 'valueDefSystemId'], false],
  ['DkvValues', ['dkvSystemId', 'valueDefSystemId'], false],
  ['SgkvValues', ['sgkvSystemId', 'valueDefSystemId'], false],
  ['VcpmCkvValues', ['vcpmCkvSystemId', 'valueDefSystemId'], false],
  ['UsecaseGkvValues', ['usecaseSystemId', 'valueDefSystemId'], false],
  [
    'SubsystemFilteredKey',
    ['subsystemsSystemId', 'keyDefinitionSystemId'],
    false,
  ],
  ['UseCaseCategoryJoin', ['useCaseSystemId', 'categorySystemId'], false],
  [
    'ModuleDefinitionContainerTypeLink',
    ['moduleDefinitionSystemId', 'containerTypeSystemId'],
    false,
  ],
  [
    'ModuleDefinitionProcessorLink',
    ['moduleDefinitionSystemId', 'processorDefinitionSystemId'],
    true,
  ],
] as const;

describe('relationship schemas with synthetic system IDs', () => {
  beforeAll(async () => {
    await setupIntegrationTest();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  it.each(RELATIONSHIP_SCHEMAS)(
    '%s uses systemId as its sole primary key and preserves its natural key',
    (entityName, naturalKey, hasVersion) => {
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
        metadata.columns.some(column => column.propertyName === 'version'),
      ).toBe(hasVersion);
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
