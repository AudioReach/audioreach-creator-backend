/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  CHANGE_OPERATION,
  CHANGE_STATUS,
  CONTROL_LINK_TYPE,
  DATA_LINK_TYPE,
  PORT_IO_TYPE,
  SOURCE,
  USECASE_TYPE,
} from '@arc/core';
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestDataSource,
} from '../../helpers/test-database-setup.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  ProjectSessionSchema,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {NODE_TYPE} from '../../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/node/node.schema.js';
import type {DbDataLinkQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/link/db-data-link-query-service.js';
import type {DbControlLinkQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/link/db-control-link-query-service.js';
import {createDataLinkQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/link/create-data-link-query-service.js';
import {createControlLinkQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/link/create-control-link-query-service.js';

const FILE_ID = 100;
const USECASE_A = 900;
const USECASE_B = 901;
const EMPTY_USECASE = 902;
const SUBGRAPH_A = 300;
const SUBGRAPH_B = 301;
const OUTSIDE_SUBGRAPH = 302;

async function seedGraph(ds: DataSource): Promise<void> {
  await ds.getRepository(ENTITY_NAMES.Project).insert({
    systemId: 1,
    name: 'Project',
    description: '',
    type: 'Offline',
  });
  await ds.getRepository(ENTITY_NAMES.ArcDbFile).insert({
    systemId: FILE_ID,
    projectSystemId: 1,
    fileName: 'graph.acdb',
    description: '',
    metadata: '{}',
    isTarget: true,
    lastReservedId: 0,
  });
  await ds.getRepository(ENTITY_NAMES.Subgraph).insert(
    [SUBGRAPH_A, SUBGRAPH_B, OUTSIDE_SUBGRAPH].map((systemId, index) => ({
      systemId,
      naturalId: index + 1,
      name: `Subgraph ${index + 1}`,
      isImported: false,
      fileSystemId: FILE_ID,
    })),
  );
  await ds.getRepository(ENTITY_NAMES.UseCase).insert(
    [USECASE_A, USECASE_B, EMPTY_USECASE].map((systemId, index) => ({
      systemId,
      aliasId: index + 1,
      alias: `Usecase ${index + 1}`,
      type: USECASE_TYPE.Linked,
      fileSystemId: FILE_ID,
    })),
  );
  await ds.getRepository(ENTITY_NAMES.UseCaseSubgraph).insert([
    {systemId: 800, usecaseSystemId: USECASE_A, subgraphSystemId: SUBGRAPH_A},
    {systemId: 801, usecaseSystemId: USECASE_B, subgraphSystemId: SUBGRAPH_B},
  ]);
  await ds.getRepository(ENTITY_NAMES.Node).insert([
    {systemId: 400, type: NODE_TYPE.Module, fileSystemId: FILE_ID},
    {systemId: 401, type: NODE_TYPE.Module, fileSystemId: FILE_ID},
  ]);

  const endpoints = [
    [SUBGRAPH_A, SUBGRAPH_A],
    [SUBGRAPH_A, SUBGRAPH_B],
    [SUBGRAPH_B, SUBGRAPH_A],
    [SUBGRAPH_A, OUTSIDE_SUBGRAPH],
    [OUTSIDE_SUBGRAPH, SUBGRAPH_A],
    [SUBGRAPH_B, OUTSIDE_SUBGRAPH],
    [OUTSIDE_SUBGRAPH, OUTSIDE_SUBGRAPH],
  ];
  for (const [
    index,
    [sourceSubgraphSystemId, destSubgraphSystemId],
  ] of endpoints.entries()) {
    await ds.getRepository(ENTITY_NAMES.DataPort).insert([
      {
        systemId: 4000 + index * 2,
        naturalId: index * 2 + 1,
        portIoType: PORT_IO_TYPE.Output,
        isStatic: true,
        nodeSystemId: 400,
      },
      {
        systemId: 4001 + index * 2,
        naturalId: index * 2 + 2,
        portIoType: PORT_IO_TYPE.Input,
        isStatic: true,
        nodeSystemId: 401,
      },
    ]);
    await ds.getRepository(ENTITY_NAMES.ControlPort).insert([
      {
        systemId: 3000 + index * 2,
        naturalId: index * 2 + 1,
        isStatic: true,
        nodeSystemId: 400,
      },
      {
        systemId: 3001 + index * 2,
        naturalId: index * 2 + 2,
        isStatic: true,
        nodeSystemId: 401,
      },
    ]);
    await ds.getRepository(ENTITY_NAMES.DataLink).insert({
      systemId: 600 + index,
      fileSystemId: FILE_ID,
      sourceNodeSystemId: 400,
      destinationNodeSystemId: 401,
      sourcePortSystemId: 4000 + index * 2,
      destinationPortSystemId: 4001 + index * 2,
      sourceSubgraphSystemId,
      destSubgraphSystemId,
      linkType: DATA_LINK_TYPE.Normal,
    });
    await ds.getRepository(ENTITY_NAMES.ControlLink).insert({
      systemId: 700 + index,
      fileSystemId: FILE_ID,
      peerNodeASystemId: 400,
      peerNodeBSystemId: 401,
      nodeAPortSystemId: 3000 + index * 2,
      nodeBPortSystemId: 3001 + index * 2,
      heapId: 0,
      sourceSubgraphSystemId,
      destSubgraphSystemId,
      linkType: CONTROL_LINK_TYPE.Normal,
    });
  }
}

describe.each([
  {
    name: 'data links',
    createService: createDataLinkQueryService,
    table: ENTITY_NAMES.DataLink,
    usecaseIds: [600, 601, 602],
    subgraphIds: [600, 601, 602, 603, 604],
    updatedIds: [600, 602, 603],
    singleUsecaseIds: [600],
    updateOutId: 601,
    updateInId: 603,
  },
  {
    name: 'control links',
    createService: createControlLinkQueryService,
    table: ENTITY_NAMES.ControlLink,
    usecaseIds: [700, 701, 702],
    subgraphIds: [700, 701, 702, 703, 704],
    updatedIds: [700, 702, 703],
    singleUsecaseIds: [700],
    updateOutId: 701,
    updateInId: 703,
  },
])('$name scoped queries (integration)', scenario => {
  let ds: DataSource;
  let service: DbDataLinkQueryService | DbControlLinkQueryService;

  beforeAll(async () => {
    await setupIntegrationTest();
  });
  afterAll(async () => {
    await teardownIntegrationTest();
  });
  beforeEach(async () => {
    await setupEachTest();
    ds = getTestDataSource();
    await seedGraph(ds);
    service = scenario.createService(ds.manager);
  });

  it('requires both endpoints in the combined requested usecases without registered pairs', async () => {
    const result = await service.findByUsecaseIds(FILE_ID, [
      USECASE_A,
      USECASE_B,
    ]);

    expect(result.map(link => link.systemId).sort()).toEqual(
      scenario.usecaseIds,
    );
  });

  it('excludes incoming and outgoing links to unrequested usecases', async () => {
    const result = await service.findByUsecaseIds(FILE_ID, [USECASE_A]);

    expect(result.map(link => link.systemId)).toEqual(
      scenario.singleUsecaseIds,
    );
  });

  it.each([{ids: []}, {ids: [EMPTY_USECASE]}])(
    'returns no links for empty membership ($ids)',
    async ({ids}) => {
      const result = await service.findByUsecaseIds(FILE_ID, ids);

      expect(result).toEqual([]);
    },
  );

  it('includes incoming and outgoing links for a single subgraph', async () => {
    const result = await service.findBySubgraphIds(FILE_ID, [SUBGRAPH_A]);

    expect(result.map(link => link.systemId).sort()).toEqual(
      scenario.subgraphIds,
    );
  });

  it('uses both effective endpoints after session updates move links into and out of scope', async () => {
    const session = await ds.getRepository(ProjectSessionSchema).save({
      fileSystemId: FILE_ID,
      userId: 'user',
      clientId: 'client',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
    await ds.getRepository(ENTITY_NAMES.EditAction).save([
      {
        sessionId: session.sessionId,
        aggregateId: scenario.updateOutId,
        targetSystemId: scenario.updateOutId,
        targetTable: scenario.table,
        operation: CHANGE_OPERATION.Update,
        fieldPath: 'destSubgraphSystemId',
        newValue: OUTSIDE_SUBGRAPH,
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
      },
      {
        sessionId: session.sessionId,
        aggregateId: scenario.updateInId,
        targetSystemId: scenario.updateInId,
        targetTable: scenario.table,
        operation: CHANGE_OPERATION.Update,
        fieldPath: 'destSubgraphSystemId',
        newValue: SUBGRAPH_B,
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Staged,
      },
    ]);

    const result = await service.findByUsecaseIds(FILE_ID, [
      USECASE_A,
      USECASE_B,
    ]);

    expect(result.map(link => link.systemId).sort()).toEqual(
      scenario.updatedIds,
    );
  });
});
