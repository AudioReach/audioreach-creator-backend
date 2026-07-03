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
  jest,
} from '@jest/globals';
import {Repository, DataSource} from 'typeorm';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
  getTestDataSource,
} from '../../helpers/test-database-setup.js';
import {
  CHANGE_OPERATION,
  CHANGE_STATUS,
  CONFIGURATION_INCLUDES,
  RESULT_KIND,
  SOURCE,
} from '@arc/core';
import {DbSpfModuleDefinitionQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/spf-module-definition/db-spf-module-definition-query-service.js';
import {EditActionsQueryService} from '../../../../src/persistence-typeorm-sqllite/queries/edit-session/edit-actions-query-service.js';
import {ENTITY_NAMES} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import type {EntityName} from '../../../../src/persistence-typeorm-sqllite/entity-schema/entity-table-names.js';
import {
  ProjectSchema,
  ProjectRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  ArcDbFileSchema,
  ArcDbFileRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {
  ProcessorDefinitionSchema,
  ProcessorDefinitionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/common/processor-definition.schema.js';
import {
  SpfModuleDefinitionSchema,
  SpfModuleDefinitionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/spf-module-definition.schema.js';
import {
  DataPortGroupSchema,
  DataPortGroupRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/data-group-definition.schema.js';
import {
  DataPortDefinitionSchema,
  DataPortDefinitionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/data-port-definition.schema.js';
import {
  StaticControlPortDefinitionSchema,
  StaticControlPortDefinitionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/static-control-port-definition.schema.js';
import {
  StaticIntentDefinitionSchema,
  StaticIntentDefinitionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/static-intent-definition.schema.js';
import {
  DynamicIntentDefinitionSchema,
  DynamicIntentDefinitionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/dynamic-intent-definition.schema.js';
import {
  SpfModuleParameterDefinitionSchema,
  SpfModuleParameterDefinitionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/spf-module-parameter-definition.schema.js';
import {
  EditActionSchema,
  EditActionRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/edit-action.schema.js';
import {
  ProjectSessionSchema,
  ProjectSessionRow,
  SESSION_MODE,
  SESSION_STATUS,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/edit-session/project-session.schema.js';
import {
  ModuleManagerDataSchema,
  ModuleManagerDataRow,
} from '../../../../src/persistence-typeorm-sqllite/entity-schema/module-manager/module-manager-data.js';

describe('DbSpfModuleDefinitionQueryService Integration Tests', () => {
  let dataSource: DataSource;
  let projectRepository: Repository<ProjectRow>;
  let arcDbFileRepository: Repository<ArcDbFileRow>;
  let processorDefinitionRepository: Repository<ProcessorDefinitionRow>;
  let moduleDefinitionRepository: Repository<SpfModuleDefinitionRow>;
  let dataPortGroupRepository: Repository<DataPortGroupRow>;
  let dataPortDefinitionRepository: Repository<DataPortDefinitionRow>;
  let staticControlPortRepository: Repository<StaticControlPortDefinitionRow>;
  let staticIntentRepository: Repository<StaticIntentDefinitionRow>;
  let dynamicIntentRepository: Repository<DynamicIntentDefinitionRow>;
  let parameterDefinitionRepository: Repository<SpfModuleParameterDefinitionRow>;
  let editActionRepository: Repository<EditActionRow>;
  let projectSessionRepository: Repository<ProjectSessionRow>;
  let moduleManagerDataRepository: Repository<ModuleManagerDataRow>;
  let service: DbSpfModuleDefinitionQueryService;

  beforeAll(async () => {
    await setupIntegrationTest();
    dataSource = getTestDataSource();
    projectRepository = getTestRepository<ProjectRow>(ProjectSchema);
    arcDbFileRepository = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    processorDefinitionRepository = getTestRepository<ProcessorDefinitionRow>(
      ProcessorDefinitionSchema,
    );
    moduleDefinitionRepository = getTestRepository<SpfModuleDefinitionRow>(
      SpfModuleDefinitionSchema,
    );
    dataPortGroupRepository =
      getTestRepository<DataPortGroupRow>(DataPortGroupSchema);
    dataPortDefinitionRepository = getTestRepository<DataPortDefinitionRow>(
      DataPortDefinitionSchema,
    );
    staticControlPortRepository =
      getTestRepository<StaticControlPortDefinitionRow>(
        StaticControlPortDefinitionSchema,
      );
    staticIntentRepository = getTestRepository<StaticIntentDefinitionRow>(
      StaticIntentDefinitionSchema,
    );
    dynamicIntentRepository = getTestRepository<DynamicIntentDefinitionRow>(
      DynamicIntentDefinitionSchema,
    );
    parameterDefinitionRepository =
      getTestRepository<SpfModuleParameterDefinitionRow>(
        SpfModuleParameterDefinitionSchema,
      );
    editActionRepository = getTestRepository<EditActionRow>(EditActionSchema);
    projectSessionRepository =
      getTestRepository<ProjectSessionRow>(ProjectSessionSchema);
    moduleManagerDataRepository = getTestRepository<ModuleManagerDataRow>(
      ModuleManagerDataSchema,
    );
    service = new DbSpfModuleDefinitionQueryService(
      dataSource,
      new EditActionsQueryService(dataSource.manager),
    );
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
  });

  async function createFileDependency(
    label = 'Test Project',
  ): Promise<{fileSystemId: number}> {
    const project = await projectRepository.save({
      name: label,
      description: 'Test',
      type: 'Offline',
    });

    const file = await arcDbFileRepository.save({
      projectSystemId: project.systemId,
      fileName: 'test.acdb',
      description: 'Test file',
      metadata: '{}',
      isTarget: false,
      lastReservedId: 0,
    });

    return {fileSystemId: file.systemId};
  }

  async function createSession(
    fileSystemId: number,
  ): Promise<ProjectSessionRow> {
    return projectSessionRepository.save({
      fileSystemId,
      userId: 'test-user-123',
      clientId: 'test-client-456',
      sessionMode: SESSION_MODE.Designer,
      status: SESSION_STATUS.Active,
      endedAt: null,
    });
  }

  async function saveUpdateAction(
    session: ProjectSessionRow,
    targetSystemId: number,
    aggregateId: number,
    targetTable: EntityName,
    newValue: unknown,
  ): Promise<void> {
    await editActionRepository.save({
      targetSystemId,
      aggregateId,
      sessionId: session.sessionId,
      targetTable,
      operation: CHANGE_OPERATION.Update,
      fieldPath: null,
      newValue,
      source: SOURCE.Manual,
      changeStatus: CHANGE_STATUS.Staged,
      groupId: null,
      linkedEntityGroupId: null,
      validUntil: null,
    });
  }

  /**
   * Seeds one module definition (with a processor) and returns its systemId.
   * moduleIndex offsets every child systemId/naturalId so multiple modules
   * can be seeded in the same file without collisions.
   */
  async function createModuleDefinition(
    fileSystemId: number,
    moduleIndex: number,
    processorSystemId?: number,
  ): Promise<number> {
    const base = 1000 * (moduleIndex + 1);
    const processor =
      processorSystemId ??
      (
        await processorDefinitionRepository.save({
          systemId: base,
          processorDefinitionId: base,
          name: `Processor${moduleIndex}`,
        })
      ).systemId;

    const module = await moduleDefinitionRepository.save({
      systemId: base + 1,
      fileSystemId,
      moduleDefinitionId: base + 1,
      name: `Module${moduleIndex}`,
      processorSystemId: processor,
      stackSize: 0,
      isLoadedAtBootup: false,
    });

    const portGroup = await dataPortGroupRepository.save({
      systemId: base + 2,
      moduleDefinitionSystemId: module.systemId,
      maxAllowedPortCount: 1,
      portIoType: 'INPUT',
    });

    await dataPortDefinitionRepository.save({
      systemId: base + 3,
      dataPortGroupSystemId: portGroup.systemId,
      dataPortId: base + 3,
      name: `Port${moduleIndex}`,
    });

    const staticPort = await staticControlPortRepository.save({
      systemId: base + 4,
      moduleDefinitionSystemId: module.systemId,
      portId: base + 4,
      portName: `StaticPort${moduleIndex}`,
    });

    await staticIntentRepository.save({
      systemId: base + 5,
      staticControlPortDefinitionSystemId: staticPort.systemId,
      intentId: base + 5,
      name: `StaticIntent${moduleIndex}`,
    });

    await dynamicIntentRepository.save({
      systemId: base + 6,
      moduleDefinitionSystemId: module.systemId,
      intentId: base + 6,
      name: `DynamicIntent${moduleIndex}`,
      maxPort: 1,
    });

    await parameterDefinitionRepository.save({
      systemId: base + 7,
      spfModuleDefinitionSystemId: module.systemId,
      paramId: base + 7,
      name: `Param${moduleIndex}`,
      maxSize: 4,
      pidType: 'test',
      isPersistent: false,
      isReadOnly: false,
    });

    return module.systemId;
  }

  async function createModuleManagerData(
    fileSystemId: number,
    moduleDefinitionSystemId: number,
  ): Promise<void> {
    await moduleManagerDataRepository.save({
      systemId: moduleDefinitionSystemId + 1000000,
      moduleDefinitionSystemId,
      fileSystemId,
      moduleType: 2, // ModuleType.Generic
      interfaceType: 2, // InterfaceType.Capi
      interfaceVersion: 3, // InterfaceVersion.CapiV3
      fileName: 'custom_module.so',
      tag: 'custom_module_tag',
    });
  }

  describe('getAllSpfModuleDefinitionSummaries — no session', () => {
    it('returns an empty array when the file has no module definitions', async () => {
      const {fileSystemId} = await createFileDependency();

      const result = await service.getAllSpfModuleDefinitionSummaries(
        fileSystemId,
        {},
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toEqual([]);
    });

    it('returns full summary shape for a single module definition', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);

      const result = await service.getAllSpfModuleDefinitionSummaries(
        fileSystemId,
        {},
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
      const summary = result.data[0];
      expect(summary.systemId).toBe(moduleSystemId);
      expect(summary.parameterDefinitions).toHaveLength(1);
      expect(summary.moduleInfo.inputDataPortInfo?.ports).toHaveLength(1);
      expect(summary.moduleInfo.staticCtrlPorts).toHaveLength(1);
      expect(summary.moduleInfo.staticCtrlPorts[0].staticIntents).toHaveLength(
        1,
      );
      expect(summary.moduleInfo.dynamicIntents).toHaveLength(1);
    });
  });

  describe('getAllSpfModuleDefinitionSummaries — session overlay, single module', () => {
    it('reflects a session UPDATE on the root module definition', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);
      const session = await createSession(fileSystemId);

      await saveUpdateAction(
        session,
        moduleSystemId,
        moduleSystemId,
        ENTITY_NAMES.SpfModuleDefinition,
        {name: 'RenamedModule'},
      );

      const result = await service.getAllSpfModuleDefinitionSummaries(
        fileSystemId,
        {},
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('RenamedModule');
    });

    it('reflects a session UPDATE on a 1-hop child (DataPortGroup)', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);
      const portGroupSystemId = 1002; // base(1000) + 2, from createModuleDefinition
      const session = await createSession(fileSystemId);

      await saveUpdateAction(
        session,
        portGroupSystemId,
        moduleSystemId,
        ENTITY_NAMES.DataPortGroup,
        {maxAllowedPortCount: 99},
      );

      const result = await service.getAllSpfModuleDefinitionSummaries(
        fileSystemId,
        {},
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(
        result.data[0].moduleInfo.inputDataPortInfo?.maxAllowedPortCount,
      ).toBe(99);
    });

    it('reflects a session UPDATE on a 2-hop child (DataPortDefinition under DataPortGroup)', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);
      const portSystemId = 1003; // base(1000) + 3
      const session = await createSession(fileSystemId);

      await saveUpdateAction(
        session,
        portSystemId,
        moduleSystemId,
        ENTITY_NAMES.DataPortDefinition,
        {name: 'RenamedPort'},
      );

      const result = await service.getAllSpfModuleDefinitionSummaries(
        fileSystemId,
        {},
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      const ports = result.data[0].moduleInfo.inputDataPortInfo?.ports ?? [];
      expect(ports).toHaveLength(1);
      expect(ports[0].name).toBe('RenamedPort');
    });

    it('reflects a session UPDATE on a 2-hop child (StaticIntentDefinition under StaticControlPortDefinition)', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);
      const staticIntentSystemId = 1005; // base(1000) + 5
      const session = await createSession(fileSystemId);

      await saveUpdateAction(
        session,
        staticIntentSystemId,
        moduleSystemId,
        ENTITY_NAMES.StaticIntentDefinition,
        {name: 'RenamedStaticIntent'},
      );

      const result = await service.getAllSpfModuleDefinitionSummaries(
        fileSystemId,
        {},
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      const staticPorts = result.data[0].moduleInfo.staticCtrlPorts;
      expect(staticPorts).toHaveLength(1);
      const staticIntents = staticPorts[0].staticIntents ?? [];
      expect(staticIntents).toHaveLength(1);
      expect(staticIntents[0].name).toBe('RenamedStaticIntent');
    });

    it('reflects a session UPDATE on DynamicIntentDefinition', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);
      const dynamicIntentSystemId = 1006; // base(1000) + 6
      const session = await createSession(fileSystemId);

      await saveUpdateAction(
        session,
        dynamicIntentSystemId,
        moduleSystemId,
        ENTITY_NAMES.DynamicIntentDefinition,
        {name: 'RenamedDynamicIntent'},
      );

      const result = await service.getAllSpfModuleDefinitionSummaries(
        fileSystemId,
        {},
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      const dynamicIntents = result.data[0].moduleInfo.dynamicIntents;
      expect(dynamicIntents).toHaveLength(1);
      expect(dynamicIntents[0].name).toBe('RenamedDynamicIntent');
    });

    it('reflects a session UPDATE on SpfModuleParameterDefinition', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);
      const paramSystemId = 1007; // base(1000) + 7
      const session = await createSession(fileSystemId);

      await saveUpdateAction(
        session,
        paramSystemId,
        moduleSystemId,
        ENTITY_NAMES.SpfModuleParameterDefinition,
        {name: 'RenamedParam'},
      );

      const result = await service.getAllSpfModuleDefinitionSummaries(
        fileSystemId,
        {},
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data[0].parameterDefinitions).toHaveLength(1);
      expect(result.data[0].parameterDefinitions[0].name).toBe('RenamedParam');
    });
  });

  describe('getAllSpfModuleDefinitionSummaries — multi-module cross-leakage checks', () => {
    it('applies a session edit only to the module it targets, not to sibling modules in the same file', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleAId = await createModuleDefinition(fileSystemId, 0);
      const moduleBId = await createModuleDefinition(fileSystemId, 1);
      const session = await createSession(fileSystemId);

      const portGroupAId = 1002; // module A's port group (base 1000 + 2)
      await saveUpdateAction(
        session,
        portGroupAId,
        moduleAId,
        ENTITY_NAMES.DataPortGroup,
        {maxAllowedPortCount: 55},
      );

      const result = await service.getAllSpfModuleDefinitionSummaries(
        fileSystemId,
        {},
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data).toHaveLength(2);

      const moduleA = result.data.find(d => d.systemId === moduleAId);
      const moduleB = result.data.find(d => d.systemId === moduleBId);
      expect(moduleA?.moduleInfo.inputDataPortInfo?.maxAllowedPortCount).toBe(
        55,
      );
      // Module B's own port group (systemId 2002) must be untouched by
      // module A's edit action — this is the one new risk the batched,
      // aggregateId-bucketed overlay introduces that per-row overlay can't
      // get wrong by construction.
      expect(moduleB?.moduleInfo.inputDataPortInfo?.maxAllowedPortCount).toBe(
        1,
      );
    });

    it('produces identical output for getSpfModuleDefinitionSummary (single-row path) and the matching row from getAllSpfModuleDefinitionSummaries', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleAId = await createModuleDefinition(fileSystemId, 0);
      await createModuleDefinition(fileSystemId, 1);
      const session = await createSession(fileSystemId);
      await saveUpdateAction(
        session,
        moduleAId,
        moduleAId,
        ENTITY_NAMES.SpfModuleDefinition,
        {name: 'RenamedA'},
      );

      const listResult = await service.getAllSpfModuleDefinitionSummaries(
        fileSystemId,
        {},
      );
      const singleResult = await service.getSpfModuleDefinitionSummary(
        moduleAId,
        fileSystemId,
      );

      expect(listResult.kind).toBe(RESULT_KIND.Ok);
      expect(singleResult.kind).toBe(RESULT_KIND.Ok);
      if (
        listResult.kind !== RESULT_KIND.Ok ||
        singleResult.kind !== RESULT_KIND.Ok
      )
        return;

      const fromList = listResult.data.find(d => d.systemId === moduleAId);
      expect(fromList).toEqual(singleResult.data);
      expect(singleResult.data.name).toBe('RenamedA');
    });
  });

  describe('getSpfModuleDefinitionSummary — not found', () => {
    it('returns ENTITY_NOT_FOUND when the module does not exist', async () => {
      const {fileSystemId} = await createFileDependency();

      const result = await service.getSpfModuleDefinitionSummary(
        999999,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Fail);
    });
  });

  describe('aggregate-scoped overlay — one getEditActionsByAggregateId call per module', () => {
    it('issues exactly one getEditActionsByAggregateId call per module in a 50-module list', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleCount = 50;
      await Promise.all(
        Array.from({length: moduleCount}, (_, i) =>
          createModuleDefinition(fileSystemId, i),
        ),
      );
      await createSession(fileSystemId);

      const editActionsSvc = new EditActionsQueryService(dataSource.manager);
      const spy = jest.spyOn(editActionsSvc, 'getByAggregateId');
      const spiedService = new DbSpfModuleDefinitionQueryService(
        dataSource,
        editActionsSvc,
      );

      try {
        const result = await spiedService.getAllSpfModuleDefinitionSummaries(
          fileSystemId,
          {},
        );

        expect(result.kind).toBe(RESULT_KIND.Ok);
        if (result.kind !== RESULT_KIND.Ok) return;
        expect(result.data).toHaveLength(moduleCount);

        // One getEditActionsByAggregateId call per module — aggregate-scoped
        // fetching trades the previous fixed 7-query O(1) shape for O(N)
        // queries, each scoped to exactly one module's own actions (no
        // session-wide over-fetch).
        expect(spy).toHaveBeenCalledTimes(moduleCount);
      } finally {
        spy.mockRestore();
      }
    }, 20000);
  });

  describe('getDefinition — single-item path unaffected by batching refactor', () => {
    it('still resolves fullDetails for a single module via the untouched per-aggregate overlay path', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);
      const session = await createSession(fileSystemId);
      await saveUpdateAction(
        session,
        moduleSystemId,
        moduleSystemId,
        ENTITY_NAMES.SpfModuleDefinition,
        {name: 'RenamedViaGetDefinition'},
      );

      const result = await service.getDefinition(
        moduleSystemId,
        fileSystemId,
        CONFIGURATION_INCLUDES.FullDetails,
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data.name).toBe('RenamedViaGetDefinition');
    });
  });

  describe('getCustomModuleMetadata', () => {
    it('returns ENTITY_NOT_FOUND when no module_manager_data row exists for the module', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);

      const result = await service.getCustomModuleMetadata(
        moduleSystemId,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Fail);
    });

    it('returns the module_manager_data row mapped to CustomModuleMetadataReadModel', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);
      await createModuleManagerData(fileSystemId, moduleSystemId);

      const result = await service.getCustomModuleMetadata(
        moduleSystemId,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind !== RESULT_KIND.Ok) return;
      expect(result.data.type.name).toBe('Generic');
      expect(result.data.type.value).toBe('2');
      expect(result.data.interface.type.name).toBe('Capi');
      expect(result.data.interface.type.value).toBe('2');
      expect(result.data.interface.version.name).toBe('CapiV3');
      expect(result.data.interface.version.value).toBe('3');
      expect(result.data.fileName).toBe('custom_module.so');
      expect(result.data.endPointFunctionTag).toBe('custom_module_tag');
    });

    it('does not match a module_manager_data row scoped to a different fileSystemId', async () => {
      const {fileSystemId} = await createFileDependency('Test Project A');
      const {fileSystemId: otherFileSystemId} =
        await createFileDependency('Test Project B');
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);
      await createModuleManagerData(otherFileSystemId, moduleSystemId);

      const result = await service.getCustomModuleMetadata(
        moduleSystemId,
        fileSystemId,
      );

      expect(result.kind).toBe(RESULT_KIND.Fail);
    });
  });

  describe('getCustomModuleMetadataBySystemIds', () => {
    it('returns an empty map when given an empty list of system ids', async () => {
      const {fileSystemId} = await createFileDependency();

      const result = await service.getCustomModuleMetadataBySystemIds(
        [],
        fileSystemId,
      );

      expect(result.size).toBe(0);
    });

    it('returns a map keyed by moduleDefinitionSystemId for every matched row, omitting modules with no module_manager_data row', async () => {
      const {fileSystemId} = await createFileDependency();
      const moduleAId = await createModuleDefinition(fileSystemId, 0);
      const moduleBId = await createModuleDefinition(fileSystemId, 1);
      const moduleCId = await createModuleDefinition(fileSystemId, 2);
      await createModuleManagerData(fileSystemId, moduleAId);
      await createModuleManagerData(fileSystemId, moduleBId);
      // moduleCId intentionally has no module_manager_data row

      const result = await service.getCustomModuleMetadataBySystemIds(
        [moduleAId, moduleBId, moduleCId],
        fileSystemId,
      );

      expect(result.size).toBe(2);
      expect(result.has(moduleAId)).toBe(true);
      expect(result.has(moduleBId)).toBe(true);
      expect(result.has(moduleCId)).toBe(false);
      expect(result.get(moduleAId)?.fileName).toBe('custom_module.so');
    });

    it('does not include a module_manager_data row scoped to a different fileSystemId', async () => {
      const {fileSystemId} = await createFileDependency('Test Project A');
      const {fileSystemId: otherFileSystemId} =
        await createFileDependency('Test Project B');
      const moduleSystemId = await createModuleDefinition(fileSystemId, 0);
      await createModuleManagerData(otherFileSystemId, moduleSystemId);

      const result = await service.getCustomModuleMetadataBySystemIds(
        [moduleSystemId],
        fileSystemId,
      );

      expect(result.size).toBe(0);
    });
  });
});
