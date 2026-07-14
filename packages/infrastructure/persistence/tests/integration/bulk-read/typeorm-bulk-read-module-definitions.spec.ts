/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {TypeOrmBulkReadQueryService} from '../../../src/persistence-typeorm-sqllite/queries/bulk-read/typeorm-bulk-read-query-service.js';
import {
  setupIntegrationTest,
  teardownIntegrationTest,
  setupEachTest,
  getTestRepository,
  getTestDataSource,
} from '../helpers/test-database-setup.js';
import {Repository} from 'typeorm';
import {ArcDbFileSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import {ProjectSchema} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';
import {
  SpfModuleDefinitionSchema,
  type SpfModuleDefinitionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/spf-module-definition.schema.js';
import {
  SpfModuleParameterDefinitionSchema,
  type SpfModuleParameterDefinitionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/spf-module-parameter-definition.schema.js';
import {
  DataPortGroupSchema,
  type DataPortGroupRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/data-group-definition.schema.js';
import {
  DataPortDefinitionSchema,
  type DataPortDefinitionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/data-port-definition.schema.js';
import {
  StaticControlPortDefinitionSchema,
  type StaticControlPortDefinitionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/static-control-port-definition.schema.js';
import {
  StaticIntentDefinitionSchema,
  type StaticIntentDefinitionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/static-intent-definition.schema.js';
import {
  DynamicIntentDefinitionSchema,
  type DynamicIntentDefinitionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/dynamic-intent-definition.schema.js';
import {
  ProcessorDefinitionSchema,
  type ProcessorDefinitionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/common/processor-definition.schema.js';
import {
  ModuleDefinitionProcessorLinkSchema,
  type ModuleDefinitionProcessorLinkRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/module-definition-processor-link.schema.js';
import {
  ContainerTypeSchema,
  type ContainerTypeRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/container/container-definition.schema.js';
import {
  ModuleDefinitionContainerTypeLinkSchema,
  type ModuleDefinitionContainerTypeLinkRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/module-definition-container-type-link.schema.js';
import {
  DriverModuleDefinitionSchema,
  type DriverModuleDefinitionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/driver/driver-module-definition.schema.js';
import {
  DriverModuleParameterDefinitionSchema,
  type DriverModuleParameterDefinitionRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/driver/driver-module-parameter-definition.schema.js';
import {
  SubgraphPropertyDefinitionSchema,
  type SubgraphPropertyRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/subgraph/subgraph-property-definition.schema.js';
import {
  ContainerPropertyDefinitionSchema,
  type ContainerPropertyRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/container/container-property-definition.schema.js';
import {
  ModulePropertyDefinitionSchema,
  type ModulePropertyRow,
} from '../../../src/persistence-typeorm-sqllite/entity-schema/definitions/module/spf/module-property-definition.schema.js';
import type {ArcDbFileRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';
import type {ProjectRow} from '../../../src/persistence-typeorm-sqllite/entity-schema/project-data/project.schema.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let projectCounter = 0;

async function createFileFixture(
  projectRepo: Repository<ProjectRow>,
  fileRepo: Repository<ArcDbFileRow>,
): Promise<number> {
  projectCounter++;
  const project = await projectRepo.save({
    name: `Test Project ${projectCounter}`,
    description: 'Test',
    type: 'Offline',
  });
  const file = await fileRepo.save({
    projectSystemId: project.systemId,
    fileName: JSON.stringify({acdb: 'test.acdb', awsp: 'test.awsp'}),
    description: 'Test file',
    metadata: '{}',
    isTarget: false,
    lastReservedId: 0,
    openStatus: 'READY',
    headerVersion: 1,
    acdbVersionMajor: 1,
    acdbVersionMinor: 0,
    acdbVersionRevision: 0,
    acdbVersionCplInfo: 0,
    codecInfos: JSON.stringify([]),
    modifiedDate: 0,
    oemInfo: '',
  });
  return file.systemId;
}

// ---------------------------------------------------------------------------
// readSpfModuleDefinitions
// ---------------------------------------------------------------------------

describe('TypeOrmBulkReadRepository - readSpfModuleDefinitions', () => {
  let repository: TypeOrmBulkReadQueryService;
  let projectRepo: Repository<ProjectRow>;
  let fileRepo: Repository<ArcDbFileRow>;
  let spfModuleRepo: Repository<SpfModuleDefinitionRow>;
  let paramRepo: Repository<SpfModuleParameterDefinitionRow>;
  let portGroupRepo: Repository<DataPortGroupRow>;
  let portDefRepo: Repository<DataPortDefinitionRow>;
  let staticPortRepo: Repository<StaticControlPortDefinitionRow>;
  let staticIntentRepo: Repository<StaticIntentDefinitionRow>;
  let dynamicIntentRepo: Repository<DynamicIntentDefinitionRow>;
  let processorRepo: Repository<ProcessorDefinitionRow>;
  let processorLinkRepo: Repository<ModuleDefinitionProcessorLinkRow>;
  let containerTypeRepo: Repository<ContainerTypeRow>;
  let containerTypeLinkRepo: Repository<ModuleDefinitionContainerTypeLinkRow>;
  let fileSystemId: number;
  let nextId: number;
  let defaultProcessorSystemId: number;

  beforeAll(async () => {
    await setupIntegrationTest();
    const ds = getTestDataSource();
    repository = new TypeOrmBulkReadQueryService(ds);
    projectRepo = getTestRepository<ProjectRow>(ProjectSchema);
    fileRepo = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    spfModuleRepo = getTestRepository<SpfModuleDefinitionRow>(
      SpfModuleDefinitionSchema,
    );
    paramRepo = getTestRepository<SpfModuleParameterDefinitionRow>(
      SpfModuleParameterDefinitionSchema,
    );
    portGroupRepo = getTestRepository<DataPortGroupRow>(DataPortGroupSchema);
    portDefRepo = getTestRepository<DataPortDefinitionRow>(
      DataPortDefinitionSchema,
    );
    staticPortRepo = getTestRepository<StaticControlPortDefinitionRow>(
      StaticControlPortDefinitionSchema,
    );
    staticIntentRepo = getTestRepository<StaticIntentDefinitionRow>(
      StaticIntentDefinitionSchema,
    );
    dynamicIntentRepo = getTestRepository<DynamicIntentDefinitionRow>(
      DynamicIntentDefinitionSchema,
    );
    processorRepo = getTestRepository<ProcessorDefinitionRow>(
      ProcessorDefinitionSchema,
    );
    processorLinkRepo = getTestRepository<ModuleDefinitionProcessorLinkRow>(
      ModuleDefinitionProcessorLinkSchema,
    );
    containerTypeRepo =
      getTestRepository<ContainerTypeRow>(ContainerTypeSchema);
    containerTypeLinkRepo =
      getTestRepository<ModuleDefinitionContainerTypeLinkRow>(
        ModuleDefinitionContainerTypeLinkSchema,
      );
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    nextId = 1;
    fileSystemId = await createFileFixture(projectRepo, fileRepo);
    const defaultProcessor = await processorRepo.save({
      systemId: nextId++,
      processorDefinitionId: 0x01,
      name: 'DefaultProcessor',
      fileSystemId: fileSystemId,
    });
    defaultProcessorSystemId = defaultProcessor.systemId;
  });

  it('should return empty array when no SPF module definitions exist', async () => {
    const result = await repository.readSpfModuleDefinitions(fileSystemId);
    expect(result).toEqual([]);
  });

  it('should return a module with basic fields', async () => {
    await spfModuleRepo.save({
      systemId: nextId++,
      fileSystemId,
      moduleDefinitionId: 0x100,
      name: 'TestModule',
      displayName: 'Test Module Display',
      description: 'A test module',
      groupName: 'TestGroup',
      modSearchKeys: 'search key',
      stackSize: 4096,
      processorSystemId: defaultProcessorSystemId,
    });

    const result = await repository.readSpfModuleDefinitions(fileSystemId);

    expect(result).toHaveLength(1);
    expect(result[0].moduleDefinitionId).toBe(0x100);
    expect(result[0].name).toBe('TestModule');
    expect(result[0].displayName).toBe('Test Module Display');
    expect(result[0].description).toBe('A test module');
    expect(result[0].groupName).toBe('TestGroup');
    expect(result[0].searchKeys).toBe('search key');
    expect(result[0].stackSize).toBe(4096);
    expect(result[0].params).toEqual([]);
    expect(result[0].portGroups).toEqual([]);
    expect(result[0].staticControlPorts).toEqual([]);
    expect(result[0].dynamicIntents).toEqual([]);
    expect(result[0].supportedProcessorIds).toEqual([0x01]);
    expect(result[0].supportedContainerTypes).toEqual([]);
  });

  it('should return module with nested parameters', async () => {
    const mod = await spfModuleRepo.save({
      systemId: nextId++,
      fileSystemId,
      moduleDefinitionId: 0x200,
      name: 'ModWithParams',
      stackSize: 0,
      processorSystemId: defaultProcessorSystemId,
    });
    await paramRepo.save({
      systemId: nextId++,
      spfModuleDefinitionSystemId: mod.systemId,
      paramId: 1,
      name: 'Param1',
      maxSize: 64,
      pidType: 'Shared',
      isPersistent: false,
      isReadOnly: false,
      elementsStructure: JSON.stringify([{type: 'uint32'}]),
      toolPolicies: JSON.stringify(['Calibration']),
    });
    await paramRepo.save({
      systemId: nextId++,
      spfModuleDefinitionSystemId: mod.systemId,
      paramId: 2,
      name: 'Param2',
      maxSize: 32,
      pidType: 'None',
      isPersistent: false,
      isReadOnly: true,
    });

    const result = await repository.readSpfModuleDefinitions(fileSystemId);

    expect(result[0].params).toHaveLength(2);
    expect(result[0].params[0].paramId).toBe(1);
    expect(result[0].params[0].pidType).toBe('Shared');
    expect(result[0].params[0].elementsStructure).toBe(
      JSON.stringify([{type: 'uint32'}]),
    );
    expect(result[0].params[0].toolPolicies).toBe(
      JSON.stringify(['Calibration']),
    );
    expect(result[0].params[0].isReadOnly).toBe(false);
    expect(result[0].params[1].paramId).toBe(2);
    expect(result[0].params[1].isReadOnly).toBe(true);
  });

  it('should return module with input and output port groups', async () => {
    const mod = await spfModuleRepo.save({
      systemId: nextId++,
      fileSystemId,
      moduleDefinitionId: 0x300,
      name: 'ModWithPorts',
      stackSize: 0,
      processorSystemId: defaultProcessorSystemId,
    });
    const inputGroup = await portGroupRepo.save({
      systemId: nextId++,
      moduleDefinitionSystemId: mod.systemId,
      maxAllowedPortCount: 4,
      portIoType: 'INPUT',
    });
    await portDefRepo.save({
      systemId: nextId++,
      dataPortGroupSystemId: inputGroup.systemId,
      dataPortId: 1,
      name: 'In0',
    });
    const outputGroup = await portGroupRepo.save({
      systemId: nextId++,
      moduleDefinitionSystemId: mod.systemId,
      maxAllowedPortCount: 2,
      portIoType: 'OUTPUT',
    });
    await portDefRepo.save({
      systemId: nextId++,
      dataPortGroupSystemId: outputGroup.systemId,
      dataPortId: 2,
      name: 'Out0',
    });

    const result = await repository.readSpfModuleDefinitions(fileSystemId);

    expect(result[0].portGroups).toHaveLength(2);
    const inputPg = result[0].portGroups.find(g => g.portIoType === 'Input')!;
    const outputPg = result[0].portGroups.find(g => g.portIoType === 'Output')!;
    expect(inputPg.maxPortCount).toBe(4);
    expect(inputPg.ports).toHaveLength(1);
    expect(inputPg.ports[0].portId).toBe(1);
    expect(inputPg.ports[0].name).toBe('In0');
    expect(outputPg.maxPortCount).toBe(2);
    expect(outputPg.ports[0].portId).toBe(2);
  });

  it('should return module with static control ports and intents', async () => {
    const mod = await spfModuleRepo.save({
      systemId: nextId++,
      fileSystemId,
      moduleDefinitionId: 0x400,
      name: 'ModWithStaticPorts',
      stackSize: 0,
      processorSystemId: defaultProcessorSystemId,
    });
    const port = await staticPortRepo.save({
      systemId: nextId++,
      moduleDefinitionSystemId: mod.systemId,
      portId: 10,
      portName: 'CtrlPort0',
    });
    await staticIntentRepo.save({
      systemId: nextId++,
      staticControlPortDefinitionSystemId: port.systemId,
      intentId: 100,
      name: 'IntentA',
    });

    const result = await repository.readSpfModuleDefinitions(fileSystemId);

    expect(result[0].staticControlPorts).toHaveLength(1);
    expect(result[0].staticControlPorts[0].portId).toBe(10);
    expect(result[0].staticControlPorts[0].portName).toBe('CtrlPort0');
    expect(result[0].staticControlPorts[0].intents).toHaveLength(1);
    expect(result[0].staticControlPorts[0].intents[0].intentId).toBe(100);
    expect(result[0].staticControlPorts[0].intents[0].name).toBe('IntentA');
  });

  it('should return module with dynamic intents', async () => {
    const mod = await spfModuleRepo.save({
      systemId: nextId++,
      fileSystemId,
      moduleDefinitionId: 0x500,
      name: 'ModWithDynamicIntents',
      stackSize: 0,
      processorSystemId: defaultProcessorSystemId,
    });
    await dynamicIntentRepo.save({
      systemId: nextId++,
      moduleDefinitionSystemId: mod.systemId,
      intentId: 200,
      name: 'DynIntent0',
      maxPort: 8,
    });

    const result = await repository.readSpfModuleDefinitions(fileSystemId);

    expect(result[0].dynamicIntents).toHaveLength(1);
    expect(result[0].dynamicIntents[0].intentId).toBe(200);
    expect(result[0].dynamicIntents[0].name).toBe('DynIntent0');
    expect(result[0].dynamicIntents[0].maxPort).toBe(8);
  });

  it('should return module with supported processor and container type IDs', async () => {
    const proc = await processorRepo.save({
      systemId: nextId++,
      processorDefinitionId: 0xa1,
      name: 'ProcessorA',
      fileSystemId: fileSystemId,
    });
    const mod = await spfModuleRepo.save({
      systemId: nextId++,
      fileSystemId,
      moduleDefinitionId: 0x600,
      name: 'ModWithLinks',
      stackSize: 0,
      processorSystemId: proc.systemId,
    });
    const ct = await containerTypeRepo.save({
      systemId: nextId++,
      value: 0xb1,
      name: 'ContainerB',
    });
    await containerTypeLinkRepo.save({
      moduleDefinitionSystemId: mod.systemId,
      containerTypeSystemId: ct.systemId,
    });

    const result = await repository.readSpfModuleDefinitions(fileSystemId);

    expect(result[0].supportedProcessorIds).toEqual([0xa1]);
    expect(result[0].supportedContainerTypes).toEqual([0xb1]);
  });

  it('should scope results to fileSystemId', async () => {
    const file2SystemId = await createFileFixture(projectRepo, fileRepo);

    await spfModuleRepo.save({
      systemId: nextId++,
      fileSystemId,
      moduleDefinitionId: 0x100,
      name: 'OwnModule',
      stackSize: 0,
      processorSystemId: defaultProcessorSystemId,
    });
    await spfModuleRepo.save({
      systemId: nextId++,
      fileSystemId: file2SystemId,
      moduleDefinitionId: 0x200,
      name: 'OtherModule',
      stackSize: 0,
      processorSystemId: defaultProcessorSystemId,
    });

    const result = await repository.readSpfModuleDefinitions(fileSystemId);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('OwnModule');
  });

  it('should order by moduleDefinitionId ascending', async () => {
    await spfModuleRepo.save({
      systemId: nextId++,
      fileSystemId,
      moduleDefinitionId: 0x300,
      name: 'ModC',
      stackSize: 0,
      processorSystemId: defaultProcessorSystemId,
    });
    await spfModuleRepo.save({
      systemId: nextId++,
      fileSystemId,
      moduleDefinitionId: 0x100,
      name: 'ModA',
      stackSize: 0,
      processorSystemId: defaultProcessorSystemId,
    });
    await spfModuleRepo.save({
      systemId: nextId++,
      fileSystemId,
      moduleDefinitionId: 0x200,
      name: 'ModB',
      stackSize: 0,
      processorSystemId: defaultProcessorSystemId,
    });

    const result = await repository.readSpfModuleDefinitions(fileSystemId);

    expect(result.map(m => m.moduleDefinitionId)).toEqual([
      0x100, 0x200, 0x300,
    ]);
  });
});

// ---------------------------------------------------------------------------
// readDriverModuleDefinitions
// ---------------------------------------------------------------------------

describe('TypeOrmBulkReadRepository - readDriverModuleDefinitions', () => {
  let repository: TypeOrmBulkReadQueryService;
  let projectRepo: Repository<ProjectRow>;
  let fileRepo: Repository<ArcDbFileRow>;
  let driverModuleRepo: Repository<DriverModuleDefinitionRow>;
  let driverParamRepo: Repository<DriverModuleParameterDefinitionRow>;
  let fileSystemId: number;
  let nextId: number;

  beforeAll(async () => {
    await setupIntegrationTest();
    const ds = getTestDataSource();
    repository = new TypeOrmBulkReadQueryService(ds);
    projectRepo = getTestRepository<ProjectRow>(ProjectSchema);
    fileRepo = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    driverModuleRepo = getTestRepository<DriverModuleDefinitionRow>(
      DriverModuleDefinitionSchema,
    );
    driverParamRepo = getTestRepository<DriverModuleParameterDefinitionRow>(
      DriverModuleParameterDefinitionSchema,
    );
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    nextId = 1;
    fileSystemId = await createFileFixture(projectRepo, fileRepo);
  });

  it('should return empty array when no driver module definitions exist', async () => {
    const result = await repository.readDriverModuleDefinitions(fileSystemId);
    expect(result).toEqual([]);
  });

  it('should return driver module with basic fields', async () => {
    await driverModuleRepo.save({
      systemId: nextId++,
      fileSystemId,
      moduleDefinitionId: 0xd100,
      name: 'DriverMod',
      description: 'A driver module',
      groupName: 'DriverGroup',
    });

    const result = await repository.readDriverModuleDefinitions(fileSystemId);

    expect(result).toHaveLength(1);
    expect(result[0].moduleDefinitionId).toBe(0xd100);
    expect(result[0].name).toBe('DriverMod');
    expect(result[0].description).toBe('A driver module');
    expect(result[0].groupName).toBe('DriverGroup');
    expect(result[0].params).toEqual([]);
  });

  it('should return driver module with nested parameters', async () => {
    const mod = await driverModuleRepo.save({
      systemId: nextId++,
      fileSystemId,
      moduleDefinitionId: 0xd200,
      name: 'DriverWithParams',
    });
    await driverParamRepo.save({
      systemId: nextId++,
      driverModuleDefinitionSystemId: mod.systemId,
      parameterId: 1,
      name: 'DParam1',
      maxSize: 16,
      paramStructure: JSON.stringify([{type: 'uint16'}]),
    });

    const result = await repository.readDriverModuleDefinitions(fileSystemId);

    expect(result[0].params).toHaveLength(1);
    expect(result[0].params[0].parameterId).toBe(1);
    expect(result[0].params[0].name).toBe('DParam1');
    expect(result[0].params[0].maxSize).toBe(16);
    expect(result[0].params[0].paramStructure).toBe(
      JSON.stringify([{type: 'uint16'}]),
    );
  });

  it('should scope results to fileSystemId', async () => {
    const file2SystemId = await createFileFixture(projectRepo, fileRepo);

    await driverModuleRepo.save({
      systemId: nextId++,
      fileSystemId,
      moduleDefinitionId: 0xd100,
      name: 'OwnDriver',
    });
    await driverModuleRepo.save({
      systemId: nextId++,
      fileSystemId: file2SystemId,
      moduleDefinitionId: 0xd200,
      name: 'OtherDriver',
    });

    const result = await repository.readDriverModuleDefinitions(fileSystemId);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('OwnDriver');
  });
});

// ---------------------------------------------------------------------------
// readSpfPropertyDefinitions
// ---------------------------------------------------------------------------

describe('TypeOrmBulkReadRepository - readSpfPropertyDefinitions', () => {
  let repository: TypeOrmBulkReadQueryService;
  let projectRepo: Repository<ProjectRow>;
  let fileRepo: Repository<ArcDbFileRow>;
  let subgraphPropRepo: Repository<SubgraphPropertyRow>;
  let containerPropRepo: Repository<ContainerPropertyRow>;
  let fileSystemId: number;
  let nextId: number;

  beforeAll(async () => {
    await setupIntegrationTest();
    const ds = getTestDataSource();
    repository = new TypeOrmBulkReadQueryService(ds);
    projectRepo = getTestRepository<ProjectRow>(ProjectSchema);
    fileRepo = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    subgraphPropRepo = getTestRepository<SubgraphPropertyRow>(
      SubgraphPropertyDefinitionSchema,
    );
    containerPropRepo = getTestRepository<ContainerPropertyRow>(
      ContainerPropertyDefinitionSchema,
    );
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    nextId = 1;
    fileSystemId = await createFileFixture(projectRepo, fileRepo);
  });

  it('should return empty array when no property definitions exist', async () => {
    const result = await repository.readSpfPropertyDefinitions(fileSystemId);
    expect(result).toEqual([]);
  });

  it('should return subgraph property definitions with categoryName SG_CFG', async () => {
    await subgraphPropRepo.save({
      systemId: nextId++,
      fileSystemId,
      propertyId: 1001,
      name: 'SgProp1',
      maxSize: 32,
      elementsStructure: JSON.stringify([{type: 'uint32'}]),
      isVoice: false,
      propertyType: 'SPF',
    });

    const result = await repository.readSpfPropertyDefinitions(fileSystemId);

    const sgProps = result.filter(p => p.categoryName === 'SG_CFG');
    expect(sgProps).toHaveLength(1);
    expect(sgProps[0].propertyId).toBe(1001);
    expect(sgProps[0].name).toBe('SgProp1');
    expect(sgProps[0].elementsStructure).toBe(
      JSON.stringify([{type: 'uint32'}]),
    );
    expect(sgProps[0].isVoice).toBe(false);
  });

  it('should return container property definitions with categoryName CONTAINTER_CFG', async () => {
    await containerPropRepo.save({
      systemId: nextId++,
      fileSystemId,
      propertyId: 2001,
      name: 'ContProp1',
      maxSize: 64,
      elementsStructure: JSON.stringify([{type: 'uint64'}]),
      propertyType: 'SPF',
    });

    const result = await repository.readSpfPropertyDefinitions(fileSystemId);

    const ctProps = result.filter(p => p.categoryName === 'CONTAINTER_CFG');
    expect(ctProps).toHaveLength(1);
    expect(ctProps[0].propertyId).toBe(2001);
    expect(ctProps[0].name).toBe('ContProp1');
    expect(ctProps[0].categoryName).toBe('CONTAINTER_CFG');
  });

  it('should return combined results from both tables', async () => {
    await subgraphPropRepo.save({
      systemId: nextId++,
      fileSystemId,
      propertyId: 1001,
      name: 'SgProp',
      maxSize: 4,
      isVoice: false,
      propertyType: 'SPF',
    });
    await containerPropRepo.save({
      systemId: nextId++,
      fileSystemId,
      propertyId: 2001,
      name: 'ContProp',
      maxSize: 4,
      propertyType: 'SPF',
    });

    const result = await repository.readSpfPropertyDefinitions(fileSystemId);

    expect(result).toHaveLength(2);
    const categories = result.map(r => r.categoryName);
    expect(categories).toContain('SG_CFG');
    expect(categories).toContain('CONTAINTER_CFG');
  });

  it('should scope results to fileSystemId', async () => {
    await subgraphPropRepo.save({
      systemId: nextId++,
      fileSystemId,
      propertyId: 1001,
      name: 'GlobalProp',
      maxSize: 4,
      isVoice: false,
      propertyType: 'SPF',
    });
    const file2SystemId = await createFileFixture(projectRepo, fileRepo);

    const result1 = await repository.readSpfPropertyDefinitions(fileSystemId);
    const result2 = await repository.readSpfPropertyDefinitions(file2SystemId);

    expect(result1).toHaveLength(1);
    expect(result2).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// readDriverPropertyDefinitions
// ---------------------------------------------------------------------------

describe('TypeOrmBulkReadRepository - readDriverPropertyDefinitions', () => {
  let repository: TypeOrmBulkReadQueryService;
  let projectRepo: Repository<ProjectRow>;
  let fileRepo: Repository<ArcDbFileRow>;
  let modulePropRepo: Repository<ModulePropertyRow>;
  let fileSystemId: number;
  let nextId: number;

  beforeAll(async () => {
    await setupIntegrationTest();
    const ds = getTestDataSource();
    repository = new TypeOrmBulkReadQueryService(ds);
    projectRepo = getTestRepository<ProjectRow>(ProjectSchema);
    fileRepo = getTestRepository<ArcDbFileRow>(ArcDbFileSchema);
    modulePropRepo = getTestRepository<ModulePropertyRow>(
      ModulePropertyDefinitionSchema,
    );
  });

  afterAll(async () => {
    await teardownIntegrationTest();
  });

  beforeEach(async () => {
    await setupEachTest();
    nextId = 1;
    fileSystemId = await createFileFixture(projectRepo, fileRepo);
  });

  it('should return empty array when no module property definitions exist', async () => {
    const result = await repository.readDriverPropertyDefinitions(fileSystemId);
    expect(result).toEqual([]);
  });

  it('should return module property definitions with all fields', async () => {
    await modulePropRepo.save({
      systemId: nextId++,
      fileSystemId,
      propertyId: 3001,
      name: 'ModProp1',
      description: 'A module property',
      maxSize: 128,
      propertyStructure: JSON.stringify([{type: 'uint8', count: 128}]),
    });

    const result = await repository.readDriverPropertyDefinitions(fileSystemId);

    expect(result).toHaveLength(1);
    expect(result[0].propertyId).toBe(3001);
    expect(result[0].name).toBe('ModProp1');
    expect(result[0].description).toBe('A module property');
    expect(result[0].maxSize).toBe(128);
    expect(result[0].propertyStructure).toBe(
      JSON.stringify([{type: 'uint8', count: 128}]),
    );
  });

  it('should scope results to fileSystemId', async () => {
    await modulePropRepo.save({
      systemId: nextId++,
      fileSystemId,
      propertyId: 3001,
      name: 'GlobalModProp',
      maxSize: 4,
      propertyStructure: '[]',
    });
    const file2SystemId = await createFileFixture(projectRepo, fileRepo);

    const result1 =
      await repository.readDriverPropertyDefinitions(fileSystemId);
    const result2 =
      await repository.readDriverPropertyDefinitions(file2SystemId);

    expect(result1).toHaveLength(1);
    expect(result2).toHaveLength(0);
  });
});
