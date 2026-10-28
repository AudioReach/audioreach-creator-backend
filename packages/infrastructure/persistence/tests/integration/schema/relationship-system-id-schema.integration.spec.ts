/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  getTestDataSource,
  setupIntegrationTest,
  teardownIntegrationTest,
} from '../helpers/test-database-setup.js';

const JUNCTION_TABLES = [
  'CkvValues',
  'TkvValues',
  'DkvValues',
  'SgkvValues',
  'VcpmCkvValues',
  'UsecaseGkvValues',
  'ModuleDefinitionContainerTypeLink',
  'ModuleDefinitionProcessorLink',
  'UseCaseCategoryJoin',
  'SubsystemFilteredKey',
] as const;

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

describe('relationship schemas with synthetic system IDs', () => {
  beforeAll(async () => {
    await setupIntegrationTest();
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  it.each(JUNCTION_TABLES)(
    '%s uses systemId as its sole primary key without TypeORM version metadata',
    entityName => {
      const metadata = getTestDataSource().getMetadata(entityName);

      expect(
        metadata.primaryColumns.map(column => column.propertyName),
      ).toEqual(['systemId']);
      expect(metadata.versionColumn).toBeUndefined();
      expect(
        metadata.columns.some(column => column.propertyName === 'version'),
      ).toBe(false);
    },
  );

  it.each(Object.entries(RELATIONSHIP_KEYS))(
    '%s preserves its natural key unique constraint',
    (entityName, naturalKey) => {
      const metadata = getTestDataSource().getMetadata(entityName);

      expect(
        metadata.indices.some(
          index =>
            index.isUnique &&
            naturalKey.every(key =>
              index.columns.some(column => column.propertyName === key),
            ),
        ),
      ).toBe(true);
    },
  );

  it.each([
    'ModuleTagIdMap',
    'TagKeyDefLink',
    'UseCaseSubgraph',
    'UseCaseSubgraphPair',
    'SubsystemDataLink',
    'SubsystemControlLink',
  ])('%s remains versioned', entityName => {
    const metadata = getTestDataSource().getMetadata(entityName);

    expect(metadata.versionColumn?.propertyName).toBe('version');
  });

  it('keeps SessionEntityVersion composite-keyed', () => {
    const metadata = getTestDataSource().getMetadata('SessionEntityVersion');

    expect(metadata.primaryColumns.map(column => column.propertyName)).toEqual([
      'sessionId',
      'targetTable',
      'targetSystemId',
    ]);
  });
});
