/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  CHANGE_OPERATION,
  CHANGE_STATUS,
  SOURCE,
  RESULT_KIND,
  Result,
  CONFIGURATION_INCLUDES,
} from '@arc/core';
import {
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {TypeOrmSessionRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/session/typeorm-session.repository.js';
import {DbSubgraphQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/subgraph/db-subgraph-query-service.js';
import {SubgraphOverlayFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/subgraph-overlay-fetcher.js';
import {SubgraphPropertyDataFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/subgraph-property-data-fetcher.js';
import {SubgraphSgkvFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/subgraph-sgkv-fetcher.js';
import {VcpmInstanceFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/vcpm-instance-fetcher.js';
import {VcpmCkvFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/vcpm-ckv-fetcher.js';
import {VcpmParameterPayloadFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/vcpm-parameter-payload-fetcher.js';
import {VcpmModuleParameterDefinitionFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/definitions/vcpm-module-definitions/vcpm-module-parameter-definition-fetcher.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {SubgraphPropertyDefinitionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/subgraph-property-definition.schema.js';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';

const FILE_ID = 100;
const SUBGRAPH_SYSTEM_ID = 42;

async function seedProjectAndFile(ds: DataSource) {
  await getTestRepository(ProjectSchema).save({
    systemId: 1,
    name: 'P',
    description: '',
    type: 'Offline',
  });
  await getTestRepository(ArcDbFileSchema).save({
    systemId: FILE_ID,
    projectSystemId: 1,
    fileName: 'f.acdb',
    description: '',
    metadata: '{}',
    isTarget: true,
    lastReservedId: 0,
  });
}

async function seedSession(ds: DataSource): Promise<number> {
  const row = await getTestRepository(ProjectSessionSchema).save({
    fileSystemId: FILE_ID,
    userId: 'u',
    clientId: 'c',
    sessionMode: SESSION_MODE.Designer,
    status: SESSION_STATUS.Active,
    endedAt: null,
  });
  return row.sessionId;
}

async function seedSubgraph(
  ds: DataSource,
  opts: {
    systemId?: number;
    naturalId?: number;
    name?: string;
  } = {},
) {
  await ds.query(
    `INSERT INTO subgraphs (system_id, subgraph_id, name, is_imported, file_system_id) VALUES (?, ?, ?, 0, ?)`,
    [
      opts.systemId ?? SUBGRAPH_SYSTEM_ID,
      opts.naturalId ?? 1,
      opts.name ?? 'sg',
      FILE_ID,
    ],
  );
}

async function seedSgkv(
  ds: DataSource,
  opts: {systemId: number; subgraphSystemId: number},
) {
  await ds.query(
    `INSERT INTO sgkv (system_id, subgraph_system_id) VALUES (?, ?)`,
    [opts.systemId, opts.subgraphSystemId],
  );
}

async function seedSubgraphPropertyDef(ds: DataSource, systemId: number) {
  await getTestRepository(SubgraphPropertyDefinitionSchema).save({
    systemId,
    fileSystemId: FILE_ID,
    naturalId: systemId,
    name: `prop-${systemId}`,
    maxSize: 4,
    propertyType: 'SPF',
    elementsStructure: '[]',
    isVoice: false,
  });
}

async function seedSubgraphPropertyData(
  ds: DataSource,
  opts: {systemId: number; subgraphPropertySystemId: number},
) {
  await seedSubgraphPropertyDef(ds, opts.subgraphPropertySystemId);
  await ds.query(
    `INSERT INTO subgraph_property_data (system_id, subgraph_system_id, subgraph_property_system_id, payload) VALUES (?, ?, ?, x'')`,
    [opts.systemId, SUBGRAPH_SYSTEM_ID, opts.subgraphPropertySystemId],
  );
}

async function seedEditAction(
  ds: DataSource,
  opts: {
    sessionId: number;
    aggregateId: number;
    targetSystemId: number;
    targetTable: string;
    operation: string;
    newValue: string;
    fieldPath?: string | null;
  },
) {
  await ds.query(
    `INSERT INTO edit_actions (session_id, aggregate_id, target_system_id, target_table, operation, field_path, new_value, source, change_status, group_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      opts.sessionId,
      opts.aggregateId,
      opts.targetSystemId,
      opts.targetTable,
      opts.operation,
      opts.fieldPath ?? null,
      opts.newValue,
      SOURCE.Manual,
      CHANGE_STATUS.Staged,
    ],
  );
}

describe('DbSubgraphQueryService.findPropertyPayloads (integration)', () => {
  let ds: DataSource;
  let svc: DbSubgraphQueryService;

  beforeAll(async () => {
    await setupIntegrationTest();
  });
  afterAll(async () => {
    await teardownIntegrationTest();
  });
  beforeEach(async () => {
    await setupEachTest();
    ds = getTestDataSource();
    await seedProjectAndFile(ds);
    const editActionsSvc = new EditActionsQueryService(ds.manager);
    const vcpmInstanceFetcher = new VcpmInstanceFetcher(ds.manager);
    svc = new DbSubgraphQueryService(
      new TypeOrmSessionRepository(ds.manager),
      {getKeyValueSummaryForGivenValues: async () => Result.ok([])} as any,
      new SubgraphOverlayFetcher(
        ds.manager,
        editActionsSvc,
        new SubgraphPropertyDataFetcher(ds.manager, editActionsSvc),
        new SubgraphSgkvFetcher(ds.manager, editActionsSvc),
      ),
      editActionsSvc,
      new VcpmCkvFetcher(ds.manager, vcpmInstanceFetcher),
      new VcpmParameterPayloadFetcher(ds.manager),
      new VcpmModuleParameterDefinitionFetcher(ds.manager),
    );
  });

  it('returns null when subgraph does not exist and no session', async () => {
    const result = await svc.findPropertyPayloads(SUBGRAPH_SYSTEM_ID, FILE_ID);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data).toBeNull();
  });

  it('returns empty PropertyPayloadReadModel[] when subgraph exists with no properties', async () => {
    await seedSubgraph(ds);
    const result = await svc.findPropertyPayloads(SUBGRAPH_SYSTEM_ID, FILE_ID);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data).toEqual([]);
  });

  it('returns PropertyPayloadReadModel[] with correct payloads (no session)', async () => {
    await seedSubgraph(ds);
    await seedSubgraphPropertyData(ds, {
      systemId: 200,
      subgraphPropertySystemId: 7,
    });
    const result = await svc.findPropertyPayloads(SUBGRAPH_SYSTEM_ID, FILE_ID);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].systemId).toBe(200);
    expect(result.data![0].propertySystemId).toBe(7);
  });

  it('returns null when session has DELETE-staged subgraph', async () => {
    await seedSubgraph(ds);
    const sessionId = await seedSession(ds);
    await seedEditAction(ds, {
      sessionId,
      aggregateId: SUBGRAPH_SYSTEM_ID,
      targetSystemId: SUBGRAPH_SYSTEM_ID,
      targetTable: ENTITY_NAMES.Subgraph,
      operation: CHANGE_OPERATION.Delete,
      newValue: '{}',
    });
    const result = await svc.findPropertyPayloads(SUBGRAPH_SYSTEM_ID, FILE_ID);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data).toBeNull();
  });

  it('reflects pending UPDATE on property payload when session active', async () => {
    await seedSubgraph(ds);
    await seedSubgraphPropertyData(ds, {
      systemId: 200,
      subgraphPropertySystemId: 7,
    });
    const sessionId = await seedSession(ds);
    await seedEditAction(ds, {
      sessionId,
      aggregateId: SUBGRAPH_SYSTEM_ID,
      targetSystemId: 200,
      targetTable: ENTITY_NAMES.SubgraphPropertyData,
      operation: CHANGE_OPERATION.Update,
      fieldPath: 'payload',
      newValue: JSON.stringify([1, 2, 3]),
    });
    const result = await svc.findPropertyPayloads(SUBGRAPH_SYSTEM_ID, FILE_ID);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data).toHaveLength(1);
  });

  it('returns property payloads assembled from CREATE action (new subgraph staged in session)', async () => {
    const sessionId = await seedSession(ds);
    await seedEditAction(ds, {
      sessionId,
      aggregateId: SUBGRAPH_SYSTEM_ID,
      targetSystemId: SUBGRAPH_SYSTEM_ID,
      targetTable: ENTITY_NAMES.Subgraph,
      operation: CHANGE_OPERATION.Create,
      newValue: JSON.stringify({
        naturalId: 1,
        name: 'sg-new',
        isImported: false,
        fileSystemId: FILE_ID,
      }),
    });
    await seedEditAction(ds, {
      sessionId,
      aggregateId: SUBGRAPH_SYSTEM_ID,
      targetSystemId: 300,
      targetTable: ENTITY_NAMES.SubgraphPropertyData,
      operation: CHANGE_OPERATION.Create,
      newValue: JSON.stringify({
        subgraphSystemId: SUBGRAPH_SYSTEM_ID,
        propertySystemId: 7,
        payload: null,
      }),
    });
    const result = await svc.findPropertyPayloads(SUBGRAPH_SYSTEM_ID, FILE_ID);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].propertySystemId).toBe(7);
  });

  it('filters subgraphs and SGKVs by requested system IDs', async () => {
    await seedSubgraph(ds, {
      systemId: SUBGRAPH_SYSTEM_ID,
      naturalId: 1,
      name: 'sg-a',
    });
    await seedSubgraph(ds, {
      systemId: 43,
      naturalId: 2,
      name: 'sg-b',
    });
    await seedSgkv(ds, {
      systemId: 501,
      subgraphSystemId: SUBGRAPH_SYSTEM_ID,
    });
    await seedSgkv(ds, {systemId: 502, subgraphSystemId: 43});

    const result = await svc.getAllSubgraphs(
      FILE_ID,
      CONFIGURATION_INCLUDES.FullDetails,
      [43],
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      systemId: 43,
      name: 'sg-b',
      sgkvs: [{systemId: 502, keyValuePairs: []}],
    });
  });

  it('treats an empty system ID list as no filter', async () => {
    await seedSubgraph(ds, {
      systemId: SUBGRAPH_SYSTEM_ID,
      naturalId: 1,
      name: 'sg-a',
    });
    await seedSubgraph(ds, {
      systemId: 43,
      naturalId: 2,
      name: 'sg-b',
    });
    await seedSgkv(ds, {
      systemId: 501,
      subgraphSystemId: SUBGRAPH_SYSTEM_ID,
    });
    await seedSgkv(ds, {systemId: 502, subgraphSystemId: 43});

    const result = await svc.getAllSubgraphs(
      FILE_ID,
      CONFIGURATION_INCLUDES.FullDetails,
      [],
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind !== RESULT_KIND.Ok) return;
    expect(result.data).toHaveLength(2);
    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          systemId: SUBGRAPH_SYSTEM_ID,
          sgkvs: [{systemId: 501, keyValuePairs: []}],
        }),
        expect.objectContaining({
          systemId: 43,
          sgkvs: [{systemId: 502, keyValuePairs: []}],
        }),
      ]),
    );
  });
});
