/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {
  CHANGE_OPERATION,
  CHANGE_STATUS,
  ENTITY_TYPE,
  FAILED_ENTITY_REASON,
  SOURCE,
  SpfModuleDefinition,
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
import {TypeOrmModuleRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/module/module.repository.js';
import {TypeOrmModuleDefinitionRepository} from '../../../../src/persistence-typeorm-sqllite/repositories/module/module-definition.repository.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {PendingChangeWriter} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-writer.js';
import {PendingChangeCache} from '../../../../src/persistence-typeorm-sqllite/services/pending-change-cache.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import type {EntityName} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {EditActionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {ProjectSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSessionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {ControlPort, DataPort} from '@arc/core';
import {KeyDefinitionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/key-definition.schema.js';
import {ValueDefinitionSchema} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/key-value/value-definition.schema.js';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from '@jest/globals';

const FILE_ID = 100;
const MODULE_ID = 50;
const DEF_ID = 200;
const CONTAINER_ID = 300;
const SUBGRAPH_ID = 400;

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

async function seedModule(ds: DataSource) {
  // Seed prerequisite tables using raw SQL to avoid FK chain complexity in tests
  await ds.query(
    `INSERT OR IGNORE INTO processor_definitions (system_id, processor_definition_id, name, file_system_id) VALUES (1, 1, 'proc', ${FILE_ID})`,
  );
  await ds.query(
    `INSERT INTO subgraphs (system_id, name, subgraph_id, is_imported, file_system_id) VALUES (?, 'sg', 1, 0, ?)`,
    [SUBGRAPH_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO containers (system_id, container_id, file_system_id) VALUES (?, 1, ?)`,
    [CONTAINER_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO spf_module_definitions (system_id, module_definition_id, name, stack_size, file_system_id, is_loaded_at_bootup, processor_system_id) VALUES (?, 1, 'def', 0, ?, 0, 1)`,
    [DEF_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'module', NULL, ?)`,
    [MODULE_ID, FILE_ID],
  );
  await ds.query(
    `INSERT INTO spf_modules (system_id, instance_id, alias, definition_system_id, container_system_id, subgraph_system_id, file_system_id) VALUES (?, 1, 'base-alias', ?, ?, ?, ?)`,
    [MODULE_ID, DEF_ID, CONTAINER_ID, SUBGRAPH_ID, FILE_ID],
  );
}

async function seedDataPort(ds: DataSource, portSystemId: number) {
  await ds.query(
    `INSERT INTO data_ports (system_id, data_port_id, port_io_type, is_static, name, node_system_id) VALUES (?, 1, 'INPUT', 0, 'p', ?)`,
    [portSystemId, MODULE_ID],
  );
}

async function seedControlPort(ds: DataSource, portSystemId: number) {
  await ds.query(
    `INSERT INTO control_ports (system_id, port_id, is_static, node_system_id) VALUES (?, 1, 0, ?)`,
    [portSystemId, MODULE_ID],
  );
}

async function seedIntent(
  ds: DataSource,
  intentSystemId: number,
  portSystemId: number,
) {
  await ds.query(
    `INSERT INTO intents (system_id, intent_id, control_port_system_id) VALUES (?, 1, ?)`,
    [intentSystemId, portSystemId],
  );
}

async function insertDeleteAction(
  qr: QueryRunner,
  sessionId: number,
  targetTable: EntityName,
  targetSystemId: number,
  aggregateId: number,
) {
  await qr.manager.getRepository(EditActionSchema).insert({
    sessionId,
    aggregateId,
    targetSystemId,
    targetTable,
    operation: CHANGE_OPERATION.Delete,
    fieldPath: null,
    newValue: {},
    source: SOURCE.Manual,
    changeStatus: CHANGE_STATUS.Unstaged,
    linkedEntityGroupId: null,
  });
}

function makeWriter(manager: QueryRunner['manager']): PendingChangeWriter {
  return new PendingChangeWriter(
    new EditActionsQueryService(manager),
    new PendingChangeCache(),
  );
}

function makeUow(sessionId: number) {
  return {
    getWriteContext: () => ({
      session: {
        sessionId,
        fileSystemId: FILE_ID,
        mode: SESSION_MODE.Designer,
        projectId: '1',
      },
      groupId: 'test-group',
    }),
  } as any;
}

function makeRepo(
  manager: QueryRunner['manager'],
  sessionId: number,
): TypeOrmModuleRepository {
  return new TypeOrmModuleRepository(
    makeWriter(manager),
    manager,
    makeUow(sessionId),
  );
}

function makeDefinitionRepo(
  manager: QueryRunner['manager'],
  sessionId: number,
): TypeOrmModuleDefinitionRepository {
  return new TypeOrmModuleDefinitionRepository(manager, makeUow(sessionId));
}

async function getActiveActions(qr: QueryRunner, sessionId: number) {
  return qr.manager
    .getRepository(EditActionSchema)
    .createQueryBuilder('editAction')
    .where('editAction.sessionId = :sessionId', {sessionId})
    .orderBy('editAction.changeId', 'ASC')
    .getMany();
}

describe('TypeOrmModuleRepository (integration)', () => {
  let ds: DataSource;
  let qr: QueryRunner;

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
    qr = ds.createQueryRunner();
    await qr.connect();
  });
  afterEach(async () => {
    await qr.release();
  });

  describe('findModuleForPatch', () => {
    it('returns null when module does not exist', async () => {
      const sessionId = await seedSession(ds);
      const repo = makeRepo(qr.manager, sessionId);
      expect(await repo.findModuleForPatch(9999, FILE_ID)).toBeNull();
    });

    it('returns SpfModule with correct fields when module exists', async () => {
      await seedModule(ds);
      const sessionId = await seedSession(ds);
      const repo = makeRepo(qr.manager, sessionId);
      const module = await repo.findModuleForPatch(MODULE_ID, FILE_ID);
      expect(module).not.toBeNull();
      expect(module!.systemId).toBe(MODULE_ID);
      expect(module!.definitionSystemId).toBe(DEF_ID);
      expect(module!.containerSystemId).toBe(CONTAINER_ID);
    });

    it('returns SpfModule with data ports populated', async () => {
      await seedModule(ds);
      await seedDataPort(ds, 600);
      const sessionId = await seedSession(ds);
      const repo = makeRepo(qr.manager, sessionId);
      const module = await repo.findModuleForPatch(MODULE_ID, FILE_ID);
      expect(module!.dataPorts).toHaveLength(1);
      expect(module!.dataPorts[0].systemId).toBe(600);
    });

    it('overlays a newly created control port with its natural ID', async () => {
      await seedModule(ds);
      const sessionId = await seedSession(ds);
      const repo = makeRepo(qr.manager, sessionId);
      await repo.addControlPort(
        new ControlPort({
          systemId: 601,
          naturalId: 9,
          isStatic: false,
          nodeSystemId: MODULE_ID,
          intentSystemIds: [],
        }),
        MODULE_ID,
      );

      const module = await repo.findModuleForPatch(MODULE_ID, FILE_ID);

      expect(module!.controlPorts).toEqual(
        expect.arrayContaining([expect.objectContaining({naturalId: 9})]),
      );
    });
  });

  describe('effective module reads', () => {
    it('treats an active module delete action as absent', async () => {
      await seedModule(ds);
      const sessionId = await seedSession(ds);
      await qr.manager.getRepository(EditActionSchema).insert({
        sessionId,
        aggregateId: MODULE_ID,
        targetSystemId: MODULE_ID,
        targetTable: ENTITY_NAMES.SpfModule,
        operation: CHANGE_OPERATION.Delete,
        fieldPath: null,
        newValue: {},
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Unstaged,
        linkedEntityGroupId: null,
      });

      expect(
        await makeRepo(qr.manager, sessionId).findModuleById(
          MODULE_ID,
          FILE_ID,
        ),
      ).toBeNull();
    });
  });

  describe('module definition reads', () => {
    it('returns deduplicated, overlaid full definitions and omits missing IDs', async () => {
      await seedModule(ds);
      const sessionId = await seedSession(ds);
      await makeWriter(qr.manager).writeDelta(
        {
          targetTable: ENTITY_NAMES.SpfModuleDefinition,
          targetSystemId: DEF_ID,
          aggregateId: DEF_ID,
          delta: {stackSize: 12},
        },
        sessionId,
        qr.manager,
      );

      const definitions = await makeDefinitionRepo(
        qr.manager,
        sessionId,
      ).findBySystemIds([DEF_ID, DEF_ID, 9999], FILE_ID);

      expect(definitions).toHaveLength(1);
      expect(definitions[0]).toBeInstanceOf(SpfModuleDefinition);
      expect(definitions[0]).toMatchObject({
        systemId: DEF_ID,
        naturalId: 1,
        stackSize: 12,
      });
    });
  });

  describe('findSpfModuleIdentities', () => {
    const UNNAMED_MODULE_ID = 51;

    async function seedUnnamedModule() {
      await ds.query(
        `INSERT INTO nodes (system_id, type, parent_id, file_system_id) VALUES (?, 'module', NULL, ?)`,
        [UNNAMED_MODULE_ID, FILE_ID],
      );
      await ds.query(
        `INSERT INTO spf_modules (system_id, instance_id, alias, definition_system_id, container_system_id, subgraph_system_id, file_system_id) VALUES (?, 2, '', ?, ?, ?, ?)`,
        [UNNAMED_MODULE_ID, DEF_ID, CONTAINER_ID, SUBGRAPH_ID, FILE_ID],
      );
    }

    it('reads aliases renamed in the session and the definition name', async () => {
      await seedModule(ds);
      await seedUnnamedModule();
      const sessionId = await seedSession(ds);
      const repo = makeRepo(qr.manager, sessionId);
      await repo.renameModule(MODULE_ID, 'renamed');

      const batch = await repo.findSpfModuleIdentities(FILE_ID, [
        MODULE_ID,
        UNNAMED_MODULE_ID,
      ]);

      expect(batch.items).toEqual(
        expect.arrayContaining([
          {
            entityType: ENTITY_TYPE.SpfModule,
            systemId: MODULE_ID,
            identity: {alias: 'renamed', definitionName: 'def', naturalId: 1},
          },
          {
            entityType: ENTITY_TYPE.SpfModule,
            systemId: UNNAMED_MODULE_ID,
            identity: {definitionName: 'def', naturalId: 2},
          },
        ]),
      );
      expect(batch.items).toHaveLength(2);
      expect(
        batch.items.find(item => item.systemId === UNNAMED_MODULE_ID)?.identity,
      ).not.toHaveProperty('alias');
      expect(batch.failed).toEqual([]);
    });

    it('names a module deleted in the session from committed data', async () => {
      await seedModule(ds);
      const sessionId = await seedSession(ds);
      const repo = makeRepo(qr.manager, sessionId);
      await repo.deleteModule(MODULE_ID, FILE_ID);

      const batch = await repo.findSpfModuleIdentities(FILE_ID, [MODULE_ID]);

      expect(batch.items).toEqual([
        {
          entityType: ENTITY_TYPE.SpfModule,
          systemId: MODULE_ID,
          identity: {
            alias: 'base-alias',
            definitionName: 'def',
            naturalId: 1,
          },
        },
      ]);
      expect(batch.failed).toEqual([]);
    });

    it('reports an ID that is not a module of the file as not found', async () => {
      await seedModule(ds);
      const sessionId = await seedSession(ds);
      const repo = makeRepo(qr.manager, sessionId);

      const batch = await repo.findSpfModuleIdentities(FILE_ID, [
        MODULE_ID,
        SUBGRAPH_ID,
      ]);
      const otherFile = await repo.findSpfModuleIdentities(FILE_ID + 1, [
        MODULE_ID,
      ]);

      expect(batch.items.map(item => item.systemId)).toEqual([MODULE_ID]);
      expect(batch.failed).toEqual([
        {systemId: SUBGRAPH_ID, reason: FAILED_ENTITY_REASON.NotFound},
      ]);
      expect(otherFile.items).toEqual([]);
      expect(otherFile.failed).toEqual([
        {systemId: MODULE_ID, reason: FAILED_ENTITY_REASON.NotFound},
      ]);
    });

    it('reports a module whose definition is deleted in the session as unresolved', async () => {
      await seedModule(ds);
      const sessionId = await seedSession(ds);
      await qr.manager.getRepository(EditActionSchema).insert({
        sessionId,
        aggregateId: DEF_ID,
        targetSystemId: DEF_ID,
        targetTable: ENTITY_NAMES.SpfModuleDefinition,
        operation: CHANGE_OPERATION.Delete,
        fieldPath: null,
        newValue: {},
        source: SOURCE.Manual,
        changeStatus: CHANGE_STATUS.Unstaged,
        linkedEntityGroupId: null,
      });

      const batch = await makeRepo(
        qr.manager,
        sessionId,
      ).findSpfModuleIdentities(FILE_ID, [MODULE_ID]);

      expect(batch.items).toEqual([]);
      expect(batch.failed).toEqual([
        {
          systemId: MODULE_ID,
          reason: FAILED_ENTITY_REASON.UnresolvedReference,
          missingRef: {
            entityType: ENTITY_TYPE.SpfModuleDefinition,
            systemId: DEF_ID,
          },
        },
      ]);
    });
  });

  describe('port identity reads', () => {
    const DATA_PORT_ID = 600;
    const CONTROL_PORT_ID = 700;
    const MODULE_REF = {
      entityType: ENTITY_TYPE.SpfModule,
      systemId: MODULE_ID,
      identity: {alias: 'base-alias', definitionName: 'def', naturalId: 1},
    };

    async function seedPorts() {
      await seedModule(ds);
      await seedDataPort(ds, DATA_PORT_ID);
      await seedControlPort(ds, CONTROL_PORT_ID);
    }

    it('returns a data port with its module, and reports other IDs as not found', async () => {
      await seedPorts();
      const sessionId = await seedSession(ds);

      const batch = await makeRepo(
        qr.manager,
        sessionId,
      ).findDataPortIdentities(FILE_ID, [DATA_PORT_ID, CONTROL_PORT_ID, 9999]);

      expect(batch).toEqual({
        entityType: ENTITY_TYPE.DataPort,
        items: [
          {
            entityType: ENTITY_TYPE.DataPort,
            systemId: DATA_PORT_ID,
            identity: {node: MODULE_REF, port: {name: 'p', naturalId: 1}},
          },
        ],
        failed: [
          {systemId: CONTROL_PORT_ID, reason: FAILED_ENTITY_REASON.NotFound},
          {systemId: 9999, reason: FAILED_ENTITY_REASON.NotFound},
        ],
      });
    });

    it('returns a control port with its module', async () => {
      await seedPorts();
      const sessionId = await seedSession(ds);

      const batch = await makeRepo(
        qr.manager,
        sessionId,
      ).findControlPortIdentities(FILE_ID, [CONTROL_PORT_ID]);

      expect(batch.items).toEqual([
        {
          entityType: ENTITY_TYPE.ControlPort,
          systemId: CONTROL_PORT_ID,
          identity: {node: MODULE_REF, port: {name: null, naturalId: 1}},
        },
      ]);
      expect(batch.failed).toEqual([]);
    });

    it('names a port deleted in the session from committed data', async () => {
      await seedPorts();
      const sessionId = await seedSession(ds);
      await insertDeleteAction(
        qr,
        sessionId,
        ENTITY_NAMES.DataPort,
        DATA_PORT_ID,
        MODULE_ID,
      );

      const batch = await makeRepo(
        qr.manager,
        sessionId,
      ).findDataPortIdentities(FILE_ID, [DATA_PORT_ID]);

      expect(batch.items.map(item => item.identity)).toEqual([
        {node: MODULE_REF, port: {name: 'p', naturalId: 1}},
      ]);
      expect(batch.failed).toEqual([]);
    });

    it('reports a port whose module definition is deleted in the session as unresolved', async () => {
      await seedPorts();
      const sessionId = await seedSession(ds);
      await insertDeleteAction(
        qr,
        sessionId,
        ENTITY_NAMES.SpfModuleDefinition,
        DEF_ID,
        DEF_ID,
      );

      const batch = await makeRepo(
        qr.manager,
        sessionId,
      ).findControlPortIdentities(FILE_ID, [CONTROL_PORT_ID]);

      expect(batch.items).toEqual([]);
      expect(batch.failed).toEqual([
        {
          systemId: CONTROL_PORT_ID,
          reason: FAILED_ENTITY_REASON.UnresolvedReference,
          missingRef: {
            entityType: ENTITY_TYPE.SpfModuleDefinition,
            systemId: DEF_ID,
          },
        },
      ]);
    });

    it('reports a port of another file as not found', async () => {
      await seedPorts();
      const sessionId = await seedSession(ds);

      const batch = await makeRepo(
        qr.manager,
        sessionId,
      ).findDataPortIdentities(FILE_ID + 1, [DATA_PORT_ID]);

      expect(batch.items).toEqual([]);
      expect(batch.failed).toEqual([
        {systemId: DATA_PORT_ID, reason: FAILED_ENTITY_REASON.NotFound},
      ]);
    });
  });

  describe('calibration identity reads', () => {
    const KEY_ID = 70;
    const LEFT_ID = 71;
    const RIGHT_ID = 72;
    const CKV_ID = 80;
    const TAG_DEFINITION_ID = 90;
    const TAG_ID = 91;
    const TKV_ID = 92;
    const MODULE_REF = {
      entityType: ENTITY_TYPE.SpfModule,
      systemId: MODULE_ID,
      identity: {alias: 'base-alias', definitionName: 'def', naturalId: 1},
    };
    const SPEAKER = {name: 'Speaker', naturalId: 7};
    const MUTE = {name: 'Mute', naturalId: 9};

    /** A module with one CKV (Left), one tag (Mute), and one TKV (Right). */
    async function seedCalibration() {
      await seedModule(ds);
      await getTestRepository(KeyDefinitionSchema).save({
        systemId: KEY_ID,
        fileSystemId: FILE_ID,
        naturalId: 7,
        name: 'Speaker',
      });
      await getTestRepository(ValueDefinitionSchema).save([
        {systemId: LEFT_ID, keySystemId: KEY_ID, naturalId: 1, name: 'Left'},
        {systemId: RIGHT_ID, keySystemId: KEY_ID, naturalId: 2, name: 'Right'},
      ]);
      await ds.query(
        `INSERT INTO ckv (system_id, spf_module_system_id) VALUES (?, ?)`,
        [CKV_ID, MODULE_ID],
      );
      await ds.query(
        `INSERT INTO ckv_values (system_id, ckv_system_id, value_def_system_id) VALUES (?, ?, ?)`,
        [81, CKV_ID, LEFT_ID],
      );
      await ds.query(
        `INSERT INTO tag_definitions (system_id, tag_id, name, file_system_id, is_voice) VALUES (?, 9, 'Mute', ?, 0)`,
        [TAG_DEFINITION_ID, FILE_ID],
      );
      await ds.query(
        `INSERT INTO module_tag_id_map (system_id, spf_module_system_id, tag_definition_system_id) VALUES (?, ?, ?)`,
        [TAG_ID, MODULE_ID, TAG_DEFINITION_ID],
      );
      await ds.query(
        `INSERT INTO tkv (system_id, module_tag_id_map_system_id) VALUES (?, ?)`,
        [TKV_ID, TAG_ID],
      );
      await ds.query(
        `INSERT INTO tkv_values (system_id, tkv_system_id, value_def_system_id) VALUES (?, ?, ?)`,
        [93, TKV_ID, RIGHT_ID],
      );
    }

    it('returns each CKV with its module and values', async () => {
      await seedCalibration();
      const sessionId = await seedSession(ds);

      const batch = await makeRepo(qr.manager, sessionId).findCkvIdentities(
        FILE_ID,
        [CKV_ID, 9999],
      );

      expect(batch).toEqual({
        entityType: ENTITY_TYPE.Ckv,
        items: [
          {
            entityType: ENTITY_TYPE.Ckv,
            systemId: CKV_ID,
            identity: {
              module: MODULE_REF,
              values: [{key: SPEAKER, value: {name: 'Left', naturalId: 1}}],
            },
          },
        ],
        failed: [{systemId: 9999, reason: FAILED_ENTITY_REASON.NotFound}],
      });
    });

    it('returns each tag with its module and tag definition', async () => {
      await seedCalibration();
      const sessionId = await seedSession(ds);

      const batch = await makeRepo(qr.manager, sessionId).findTagIdentities(
        FILE_ID,
        [TAG_ID],
      );

      expect(batch.items).toEqual([
        {
          entityType: ENTITY_TYPE.Tag,
          systemId: TAG_ID,
          identity: {module: MODULE_REF, tag: MUTE},
        },
      ]);
      expect(batch.failed).toEqual([]);
    });

    it('returns each TKV with its module, tag, and values', async () => {
      await seedCalibration();
      const sessionId = await seedSession(ds);

      const batch = await makeRepo(qr.manager, sessionId).findTkvIdentities(
        FILE_ID,
        [TKV_ID],
      );

      expect(batch.items).toEqual([
        {
          entityType: ENTITY_TYPE.Tkv,
          systemId: TKV_ID,
          identity: {
            module: MODULE_REF,
            tag: MUTE,
            values: [{key: SPEAKER, value: {name: 'Right', naturalId: 2}}],
          },
        },
      ]);
      expect(batch.failed).toEqual([]);
    });

    it('names a CKV deleted in the session from committed data', async () => {
      await seedCalibration();
      const sessionId = await seedSession(ds);
      await insertDeleteAction(
        qr,
        sessionId,
        ENTITY_NAMES.Ckv,
        CKV_ID,
        MODULE_ID,
      );

      const batch = await makeRepo(qr.manager, sessionId).findCkvIdentities(
        FILE_ID,
        [CKV_ID],
      );

      expect(batch.items.map(item => item.systemId)).toEqual([CKV_ID]);
      expect(batch.failed).toEqual([]);
    });

    it('reports calibration data as unresolved when its module cannot be named', async () => {
      await seedCalibration();
      const sessionId = await seedSession(ds);
      await insertDeleteAction(
        qr,
        sessionId,
        ENTITY_NAMES.SpfModuleDefinition,
        DEF_ID,
        DEF_ID,
      );
      const repo = makeRepo(qr.manager, sessionId);
      const unresolved = (systemId: number) => ({
        systemId,
        reason: FAILED_ENTITY_REASON.UnresolvedReference,
        missingRef: {entityType: ENTITY_TYPE.SpfModule, systemId: MODULE_ID},
      });

      const ckvs = await repo.findCkvIdentities(FILE_ID, [CKV_ID]);
      const tags = await repo.findTagIdentities(FILE_ID, [TAG_ID]);
      const tkvs = await repo.findTkvIdentities(FILE_ID, [TKV_ID]);

      expect(ckvs).toMatchObject({items: [], failed: [unresolved(CKV_ID)]});
      expect(tags).toMatchObject({items: [], failed: [unresolved(TAG_ID)]});
      expect(tkvs).toMatchObject({items: [], failed: [unresolved(TKV_ID)]});
    });

    it('reports calibration data of another file as not found', async () => {
      await seedCalibration();
      const sessionId = await seedSession(ds);
      const repo = makeRepo(qr.manager, sessionId);
      const notFound = (systemId: number) => ({
        systemId,
        reason: FAILED_ENTITY_REASON.NotFound,
      });

      const ckvs = await repo.findCkvIdentities(FILE_ID + 1, [CKV_ID]);
      const tags = await repo.findTagIdentities(FILE_ID + 1, [TAG_ID]);
      const tkvs = await repo.findTkvIdentities(FILE_ID + 1, [TKV_ID]);

      expect(ckvs).toMatchObject({items: [], failed: [notFound(CKV_ID)]});
      expect(tags).toMatchObject({items: [], failed: [notFound(TAG_ID)]});
      expect(tkvs).toMatchObject({items: [], failed: [notFound(TKV_ID)]});
    });
  });

  describe('getModulesWithStackSizeByContainer', () => {
    it('uses the effective stack size from the overlaid module definition', async () => {
      await seedModule(ds);
      const sessionId = await seedSession(ds);
      await makeWriter(qr.manager).writeDelta(
        {
          targetTable: ENTITY_NAMES.SpfModuleDefinition,
          targetSystemId: DEF_ID,
          aggregateId: DEF_ID,
          delta: {stackSize: 12},
        },
        sessionId,
        qr.manager,
      );

      const result = await makeRepo(
        qr.manager,
        sessionId,
      ).getModulesWithStackSizeByContainer(CONTAINER_ID, FILE_ID);

      expect(result).toEqual([{moduleSystemId: MODULE_ID, stackSize: 12}]);
    });
  });

  describe('renameModule', () => {
    it('writes a delta edit_action row with alias and correct metadata', async () => {
      await seedModule(ds);
      const sessionId = await seedSession(ds);
      await qr.startTransaction();
      const repo = makeRepo(qr.manager, sessionId);
      await repo.renameModule(MODULE_ID, 'new-alias');
      await qr.commitTransaction();
      const rows: any[] = await ds.query(
        `SELECT * FROM edit_actions WHERE session_id = ? AND aggregate_id = ? AND target_table = ?`,
        [sessionId, MODULE_ID, ENTITY_NAMES.SpfModule],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].change_status).toBe(CHANGE_STATUS.Staged);
      expect(rows[0].source).toBe(SOURCE.Manual);
    });
  });

  describe('addDataPort / deleteDataPort', () => {
    it('addDataPort writes a CREATE edit_action for DataPort under module aggregate', async () => {
      await seedModule(ds);
      const sessionId = await seedSession(ds);
      await qr.startTransaction();
      const repo = makeRepo(qr.manager, sessionId);
      const port = new DataPort({
        systemId: 700,
        naturalId: 1,
        portIoType: 'INPUT',
        isStatic: false,
        name: 'p',
      });
      await repo.addDataPort(port, MODULE_ID);
      await qr.commitTransaction();
      const rows: any[] = await ds.query(
        `SELECT * FROM edit_actions WHERE session_id = ? AND aggregate_id = ? AND target_table = ? AND operation = ?`,
        [sessionId, MODULE_ID, ENTITY_NAMES.DataPort, CHANGE_OPERATION.Create],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].target_system_id).toBe(700);
    });

    it('deleteDataPort writes a DELETE edit_action for DataPort', async () => {
      await seedModule(ds);
      await seedDataPort(ds, 600);
      const sessionId = await seedSession(ds);
      await qr.startTransaction();
      const repo = makeRepo(qr.manager, sessionId);
      await repo.deleteDataPort(600, MODULE_ID);
      await qr.commitTransaction();
      const rows: any[] = await ds.query(
        `SELECT * FROM edit_actions WHERE session_id = ? AND target_system_id = ? AND operation = ?`,
        [sessionId, 600, CHANGE_OPERATION.Delete],
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('deleteModule', () => {
    it('records deletes for module-owned rows as current state', async () => {
      await seedModule(ds);
      await seedDataPort(ds, 600);
      await seedControlPort(ds, 601);
      await seedIntent(ds, 701, 601);
      const sessionId = await seedSession(ds);

      await makeRepo(qr.manager, sessionId).deleteModule(MODULE_ID, FILE_ID);

      const actions = await getActiveActions(qr, sessionId);
      const deletes = actions.filter(
        action => action.operation === CHANGE_OPERATION.Delete,
      );
      expect(
        deletes.map(action => ({
          targetTable: action.targetTable,
          targetSystemId: action.targetSystemId,
          aggregateId: action.aggregateId,
        })),
      ).toEqual(
        expect.arrayContaining([
          {
            targetTable: ENTITY_NAMES.Intent,
            targetSystemId: 701,
            aggregateId: MODULE_ID,
          },
          {
            targetTable: ENTITY_NAMES.DataPort,
            targetSystemId: 600,
            aggregateId: MODULE_ID,
          },
          {
            targetTable: ENTITY_NAMES.ControlPort,
            targetSystemId: 601,
            aggregateId: MODULE_ID,
          },
          {
            targetTable: ENTITY_NAMES.SpfModule,
            targetSystemId: MODULE_ID,
            aggregateId: MODULE_ID,
          },
          {
            targetTable: ENTITY_NAMES.Node,
            targetSystemId: MODULE_ID,
            aggregateId: MODULE_ID,
          },
        ]),
      );
    });
  });
});
