/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {
  afterAll,
  beforeAll,
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
  getTestRepository,
} from '../../helpers/test-database-setup.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {DbCkvCalibrationQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/module-calibration/db-ckv-calibration-query-service.js';
import {DbKeyValueDefQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/key-value/db-key-value-def-query-service.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  ProjectSessionSchema,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {EditActionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {KeyDefinitionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/key-definition.schema.js';
import {ValueDefinitionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/value-definition.schema.js';
import {CkvValuesSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/usecase-data/module/spf-module-calibration-data.schema.js';
import {CHANGE_OPERATION, CHANGE_STATUS, SOURCE} from '@arc/core';

describe('DbCkvCalibrationQueryService definition filtering', () => {
  beforeAll(setupIntegrationTest);
  afterAll(teardownIntegrationTest);
  beforeEach(async () => {
    await setupEachTest();
    const ds = getTestDataSource();
    await getTestRepository(ProjectSchema).save({
      systemId: 2,
      name: 'P2',
      description: '',
      type: 'Offline',
    });
    await getTestRepository(ArcDbFileSchema).save({
      systemId: 300,
      projectSystemId: 2,
      fileName: 'g.acdb',
      description: '',
      metadata: '{}',
      isTarget: true,
      lastReservedId: 0,
    });
    await ds.query(
      "INSERT OR IGNORE INTO processor_definitions (system_id, processor_definition_id, name, file_system_id) VALUES (2, 2, 'proc2', 300)",
    );
    await ds.query(
      "INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (410, 'sg2', 2, 0, 300)",
    );
    await ds.query(
      'INSERT INTO containers (system_id, container_id, container_type_system_id, file_system_id) VALUES (510, 2, 5, 300)',
    );
    await ds.query(
      "INSERT INTO spf_module_definitions (system_id, module_definition_id, name, stack_size, file_system_id, is_loaded_at_bootup, processor_system_id) VALUES (310, 2, 'mod2', 0, 300, 0, 2)",
    );
    await ds.query(
      "INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (70, 'module', NULL, 300)",
    );
    await ds.query(
      "INSERT INTO spf_modules (system_id, instance_id, alias, definition_system_id, container_system_id, subgraph_system_id, file_system_id) VALUES (70, 2, 'mod2', 310, 510, 410, 300)",
    );
    await ds.query(
      'INSERT INTO ckv (system_id, spf_module_system_id) VALUES (90, 70), (91, 70)',
    );
    await ds.query(
      "INSERT INTO spf_module_parameter_definitions (system_id, param_id, name, max_size, is_persistent, elements_structure, is_read_only, pid_type, spf_module_definition_system_id) VALUES (25, 134221862, 'enable', 4, 1, '[]', 0, 'NONE', 310), (26, 42, 'gain', 4, 1, '[]', 0, 'NONE', 310)",
    );
    await ds.query(
      "INSERT INTO ckv_parameter_payload (system_id, ckv_system_id, parameter_system_id, payload) VALUES (35, 90, 25, X'01000000'), (36, 90, 26, X'05000000'), (37, 91, 25, X'00000000')",
    );
  });

  it('returns only the requested definition in the selected CKV', async () => {
    const ds = getTestDataSource();
    const editSvc = new EditActionsQueryService(ds.manager);
    const svc = new DbCkvCalibrationQueryService(
      ds,
      editSvc,
      new DbKeyValueDefQueryService(ds.manager, editSvc),
    );
    const payloads = await svc.getCkvPayloads(300, 70, 90, [25]);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({systemId: 25});
    expect(Array.from(payloads[0].payload ?? [])).toEqual([1, 0, 0, 0]);
    expect(await svc.getCkvPayloads(300, 70, 90, [35])).toEqual([]);
    expect(await svc.getCkvPayloads(300, 70, 90)).toHaveLength(2);
  });

  it('keeps definition filtering when a designer session is active', async () => {
    await getTestRepository(ProjectSessionSchema).save({
      fileSystemId: 300,
      userId: 'u',
      clientId: 'c',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
    const ds = getTestDataSource();
    const editSvc = new EditActionsQueryService(ds.manager);
    const svc = new DbCkvCalibrationQueryService(
      ds,
      editSvc,
      new DbKeyValueDefQueryService(ds.manager, editSvc),
    );
    const payloads = await svc.getCkvPayloads(300, 70, 90, [25]);
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({systemId: 25});
  });

  it('rejects when a value of the CKV was deleted in the session', async () => {
    await getTestRepository(KeyDefinitionSchema).save({
      systemId: 80,
      fileSystemId: 300,
      naturalId: 8,
      name: 'Device',
    });
    await getTestRepository(ValueDefinitionSchema).save({
      systemId: 800,
      keySystemId: 80,
      naturalId: 1,
      name: 'Speaker',
    });
    await getTestRepository(CkvValuesSchema).save({
      systemId: 95,
      ckvSystemId: 90,
      valueDefSystemId: 800,
    });
    const session = await getTestRepository(ProjectSessionSchema).save({
      fileSystemId: 300,
      userId: 'u',
      clientId: 'c',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
    await getTestRepository(EditActionSchema).save({
      targetSystemId: 800,
      aggregateId: 80,
      sessionId: session.sessionId,
      targetTable: ENTITY_NAMES.ValueDefinition,
      operation: CHANGE_OPERATION.Delete,
      fieldPath: '$',
      newValue: {},
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      linkedEntityGroupId: null,
    });
    const ds = getTestDataSource();
    const editSvc = new EditActionsQueryService(ds.manager);
    const svc = new DbCkvCalibrationQueryService(
      ds,
      editSvc,
      new DbKeyValueDefQueryService(ds.manager, editSvc),
    );

    await expect(svc.getCkv(300, 70, 90)).rejects.toThrow(
      'CKV 90 references missing value definition 800',
    );
  });
});
