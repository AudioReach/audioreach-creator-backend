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
import {DbSubsystemQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/subsystem/db-subsystem-query-service.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {SubsystemOverlayFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/subsystem-overlay-fetcher.js';
import {UsecaseOverlayFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/usecase-overlay-fetcher.js';
import {LinkOverlayFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/link-overlay-fetcher.js';
import {PortOverlayFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/port-overlay-fetcher.js';
import {IntentFetcher} from '../../../../src/persistence-typeorm-sqllite/fetchers/intent-fetcher.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';

const FILE_ID = 100;
const USECASE_ID = 200;
const SOURCE_SUBGRAPH_ID = 300;
const DEST_SUBGRAPH_ID = 301;
const SOURCE_NODE_ID = 400;
const DEST_NODE_ID = 401;
const SOURCE_CONTROL_PORT_ID = 500;
const DEST_CONTROL_PORT_ID = 501;
const SOURCE_DATA_PORT_ID = 502;
const DEST_DATA_PORT_ID = 503;
const CONTROL_LINK_ID = 600;
const DATA_LINK_ID = 601;
const CONTROL_SEGMENT_ID = 700;
const DATA_SEGMENT_ID = 701;

async function seedProjectAndFile(ds: DataSource): Promise<void> {
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

async function seedUsecaseGraph(ds: DataSource): Promise<void> {
  await ds.query(
    `INSERT INTO subgraphs (system_id, subgraph_id, name, is_imported, file_system_id)
     VALUES (?, 1, 'source', 0, ?), (?, 2, 'dest', 0, ?)`,
    [SOURCE_SUBGRAPH_ID, FILE_ID, DEST_SUBGRAPH_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO use_cases (system_id, alias_id, alias, file_system_id)
     VALUES (?, 1, 'usecase', ?)`,
    [USECASE_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO use_case_subgraphs
       (system_id, usecase_system_id, subgraph_system_id)
     VALUES (201, ?, ?)`,
    [USECASE_ID, SOURCE_SUBGRAPH_ID],
  );
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id)
     VALUES (?, 'module', NULL, ?), (?, 'module', NULL, ?)`,
    [SOURCE_NODE_ID, FILE_ID, DEST_NODE_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO control_ports (system_id, port_id, is_static, node_system_id)
     VALUES (?, 1, 1, ?), (?, 2, 1, ?)`,
    [
      SOURCE_CONTROL_PORT_ID,
      SOURCE_NODE_ID,
      DEST_CONTROL_PORT_ID,
      DEST_NODE_ID,
    ],
  );
  await ds.query(
    `INSERT INTO data_ports
       (system_id, data_port_id, port_io_type, is_static, node_system_id)
     VALUES (?, 1, 'OUTPUT', 1, ?), (?, 2, 'INPUT', 1, ?)`,
    [SOURCE_DATA_PORT_ID, SOURCE_NODE_ID, DEST_DATA_PORT_ID, DEST_NODE_ID],
  );
  await ds.query(
    `INSERT INTO control_links
       (system_id, file_system_id, peer_nodeA_system_id, peer_nodeB_system_id,
        nodeA_port_system_id, nodeB_port_system_id, heap_id, link_type,
        source_subgraph_system_id, dest_subgraph_system_id)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'INTRA_USECASE', ?, ?)`,
    [
      CONTROL_LINK_ID,
      FILE_ID,
      SOURCE_NODE_ID,
      DEST_NODE_ID,
      SOURCE_CONTROL_PORT_ID,
      DEST_CONTROL_PORT_ID,
      SOURCE_SUBGRAPH_ID,
      DEST_SUBGRAPH_ID,
    ],
  );
  await ds.query(
    `INSERT INTO data_links
       (system_id, source_node_system_id, destination_node_system_id,
        source_port_system_id, destination_port_system_id, link_type,
        source_subgraph_system_id, dest_subgraph_system_id, file_system_id)
     VALUES (?, ?, ?, ?, ?, 'INTRA_USECASE', ?, ?, ?)`,
    [
      DATA_LINK_ID,
      SOURCE_NODE_ID,
      DEST_NODE_ID,
      SOURCE_DATA_PORT_ID,
      DEST_DATA_PORT_ID,
      SOURCE_SUBGRAPH_ID,
      DEST_SUBGRAPH_ID,
      FILE_ID,
    ],
  );
  await ds.query(
    `INSERT INTO subsystem_control_links
       (system_id, peer_nodeA_system_id, peer_nodeB_system_id,
        nodeA_port_system_id, nodeB_port_system_id, control_link_system_id,
        file_system_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      CONTROL_SEGMENT_ID,
      SOURCE_NODE_ID,
      DEST_NODE_ID,
      SOURCE_CONTROL_PORT_ID,
      DEST_CONTROL_PORT_ID,
      CONTROL_LINK_ID,
      FILE_ID,
    ],
  );
  await ds.query(
    `INSERT INTO subsystem_data_links
       (system_id, source_node_system_id, destination_node_system_id,
        source_port_system_id, destination_port_system_id, data_link_system_id,
        file_system_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      DATA_SEGMENT_ID,
      SOURCE_NODE_ID,
      DEST_NODE_ID,
      SOURCE_DATA_PORT_ID,
      DEST_DATA_PORT_ID,
      DATA_LINK_ID,
      FILE_ID,
    ],
  );
}

describe('DbSubsystemQueryService segment queries (integration)', () => {
  let ds: DataSource;
  let service: DbSubsystemQueryService;

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
    const editActions = new EditActionsQueryService(ds.manager);
    service = new DbSubsystemQueryService(
      ds,
      new SubsystemOverlayFetcher(ds.manager, editActions),
      new UsecaseOverlayFetcher(ds.manager, editActions),
      new LinkOverlayFetcher(ds.manager, editActions),
      new PortOverlayFetcher(
        ds.manager,
        editActions,
        new IntentFetcher(ds.manager, editActions),
      ),
    );
  });

  it('returns data and control segments for effective usecase membership', async () => {
    await seedUsecaseGraph(ds);

    const [controlResult, dataResult] = await Promise.all([
      service.findControlLinkSegmentsByUsecaseIds([USECASE_ID], FILE_ID),
      service.findDataLinkSegmentsByUsecaseIds([USECASE_ID], FILE_ID),
    ]);

    expect(controlResult.kind).toBe(RESULT_KIND.Ok);
    expect(controlResult.data).toEqual([
      expect.objectContaining({systemId: CONTROL_SEGMENT_ID}),
    ]);
    expect(dataResult.kind).toBe(RESULT_KIND.Ok);
    expect(dataResult.data).toEqual([
      expect.objectContaining({systemId: DATA_SEGMENT_ID}),
    ]);
  });
});
