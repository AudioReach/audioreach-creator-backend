/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {RESULT_KIND} from '@arc/core';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {DbSubgraphQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/subgraph/db-subgraph-query-service.js';
import {SubgraphOverlayFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/subgraph-overlay-fetcher.js';
import {SubgraphPropertyDataFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/subgraph-property-data-fetcher.js';
import {SubgraphSgkvFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/subgraph-sgkv-fetcher.js';
import {VcpmInstanceFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/vcpm-instance-fetcher.js';
import {VcpmCkvFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/vcpm-ckv-fetcher.js';
import {VcpmParameterPayloadFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/vcpm-parameter-payload-fetcher.js';
import {VcpmModuleParameterDefinitionFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/definitions/vcpm-module-definitions/vcpm-module-parameter-definition-fetcher.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {TypeOrmSessionRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/session/typeorm-session.repository.js';
import {
  ProjectSessionSchema,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {DbKeyValueDefQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/key-value/db-key-value-def-query-service.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  describe,
  it,
  expect,
  jest,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';

const FILE_ID = 100;
const SUBGRAPH_ID = 400;
const VCPM_DEF_ID = 10;
const VCPM_INSTANCE_ID = 20;
const CKV_ID = 30;
const VALUE_DEF_ID = 50;
const PARAM_DEF_ID = 60;
const PAYLOAD_ID = 70;

async function seedAll(ds: DataSource) {
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
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg', 1, 0, ?)`,
    [SUBGRAPH_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_module_definitions (system_id, module_definition_id, name, file_system_id) VALUES (?, 1, 'vcpm_def', ?)`,
    [VCPM_DEF_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_instances (system_id, subgraph_system_id, vcpm_definition_id) VALUES (?, ?, ?)`,
    [VCPM_INSTANCE_ID, SUBGRAPH_ID, VCPM_DEF_ID],
  );
  await ds.query(
    `INSERT INTO arc_keys (system_id, key_id, name, file_system_id) VALUES (?, 1, 'mode', ?)`,
    [1, FILE_ID],
  );
  await ds.query(
    `INSERT INTO arc_values (system_id, value_id, name, keys_system_id) VALUES (?, 1, 'hifi', ?)`,
    [VALUE_DEF_ID, 1],
  );
  await ds.query(
    `INSERT INTO vcpm_ckv (system_id, vcpm_instance_system_id) VALUES (?, ?)`,
    [CKV_ID, VCPM_INSTANCE_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_ckv_values (vcpm_ckv_system_id, value_def_system_id) VALUES (?, ?)`,
    [CKV_ID, VALUE_DEF_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_module_parameter_definitions (system_id, param_id, max_size, pid_type, is_persistent, elements_structure, is_read_only, vcpm_module_definition_system_id) VALUES (?, 1, 64, 'TYPE_A', 1, '[]', 0, ?)`,
    [PARAM_DEF_ID, VCPM_DEF_ID],
  );
  await ds.query(
    `INSERT INTO vcpm_parameter_payload (system_id, vcpm_parameter_system_id, vcpm_ckv_system_id, payload) VALUES (?, ?, ?, ?)`,
    [PAYLOAD_ID, PARAM_DEF_ID, CKV_ID, Buffer.from([1, 2, 3, 4])],
  );
}

function makeService(ds: DataSource): {
  service: DbSubgraphQueryService;
  editActionsSvc: EditActionsQueryService;
} {
  const editActionsSvc = new EditActionsQueryService(ds.manager);
  const vcpmInstanceFetcher = new VcpmInstanceFetcher(ds.manager);
  const keyValueService = new DbKeyValueDefQueryService(ds, editActionsSvc);
  return {
    service: new DbSubgraphQueryService(
      new TypeOrmSessionRepository(ds.manager),
      keyValueService,
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
    ),
    editActionsSvc,
  };
}

async function seedActiveSession(ds: DataSource): Promise<void> {
  await getTestRepository(ProjectSessionSchema).save({
    fileSystemId: FILE_ID,
    userId: 'u',
    clientId: 'c',
    sessionMode: SESSION_MODE.Designer,
    status: SESSION_STATUS.Active,
    endedAt: null,
  });
}

describe('DbSubgraphQueryService VCPM aggregate (integration)', () => {
  let ds: DataSource;
  let service: DbSubgraphQueryService;
  let editActionsSvc: EditActionsQueryService;

  beforeAll(async () => {
    await setupIntegrationTest();
  });
  afterAll(async () => {
    await teardownIntegrationTest();
  });
  beforeEach(async () => {
    await setupEachTest();
    ds = getTestDataSource();
    await seedAll(ds);
    const made = makeService(ds);
    service = made.service;
    editActionsSvc = made.editActionsSvc;
  });

  it('returns CKVs, links, and VCPM definitions for a subgraph summary', async () => {
    const getByAggregateIdSpy = jest.spyOn(editActionsSvc, 'getByAggregateId');
    const result = await service.getVcpmAggregateBySubgraph(
      SUBGRAPH_ID,
      FILE_ID,
    );
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data.ckvs).toHaveLength(1);
    expect(result.data.ckvs[0].values[0].key.naturalId).toBe(1);
    expect(result.data.parameterCkvLinks).toEqual([
      {parameterSystemId: PARAM_DEF_ID, ckvSystemIds: [CKV_ID]},
    ]);
    expect(result.data.payloads).toEqual([]);
    expect(result.data.parameterDefinitions[0].systemId).toBe(PARAM_DEF_ID);
    expect(result.data.parameterDefinitions[0].paramId).toBe(1);
    expect(getByAggregateIdSpy).not.toHaveBeenCalled();
  });

  it('loads the edit-action aggregate once for an active-session summary', async () => {
    await seedActiveSession(ds);
    const getByAggregateIdSpy = jest.spyOn(editActionsSvc, 'getByAggregateId');

    await service.getVcpmAggregateBySubgraph(SUBGRAPH_ID, FILE_ID);

    expect(getByAggregateIdSpy).toHaveBeenCalledTimes(1);
  });

  it('returns only the selected CKV and its payloads for calibration data', async () => {
    const fetchLinksSpy = jest.spyOn(
      (
        service as unknown as {
          parameterPayloadFetcher: VcpmParameterPayloadFetcher;
        }
      ).parameterPayloadFetcher,
      'fetchParameterCkvLinksBySubgraph',
    );

    const result = await service.getVcpmAggregateBySubgraph(
      SUBGRAPH_ID,
      FILE_ID,
      {ckvSystemId: CKV_ID, paramSystemIds: [PARAM_DEF_ID]},
    );
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data.ckvs.map(ckv => ckv.systemId)).toEqual([CKV_ID]);
    expect(result.data.payloads).toHaveLength(1);
    expect(result.data.payloads[0].payload).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );
    expect(result.data.parameterCkvLinks).toEqual([]);
    expect(result.data.parameterDefinitions).toHaveLength(1);
    expect(fetchLinksSpy).not.toHaveBeenCalled();
  });

  it('loads the edit-action aggregate once for an active-session selected CKV', async () => {
    await seedActiveSession(ds);
    const getByAggregateIdSpy = jest.spyOn(editActionsSvc, 'getByAggregateId');

    await service.getVcpmAggregateBySubgraph(SUBGRAPH_ID, FILE_ID, {
      ckvSystemId: CKV_ID,
      paramSystemIds: [PARAM_DEF_ID],
    });

    expect(getByAggregateIdSpy).toHaveBeenCalledTimes(1);
  });

  it('returns an empty aggregate when the requested CKV is outside the subgraph', async () => {
    const result = await service.getVcpmAggregateBySubgraph(
      SUBGRAPH_ID,
      FILE_ID,
      {ckvSystemId: 9999},
    );
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(result.data).toEqual({
      ckvs: [],
      parameterCkvLinks: [],
      payloads: [],
      parameterDefinitions: [],
    });
  });
});
