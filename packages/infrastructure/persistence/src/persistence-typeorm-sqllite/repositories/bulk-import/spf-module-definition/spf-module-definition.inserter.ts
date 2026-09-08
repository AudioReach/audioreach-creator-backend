/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  BulkInsertResult,
  IdGenerationPort,
  SpfModuleDefinition,
} from '@arc/core';
import {okBulkInsert, BinaryUtils} from '@arc/core';
import type {BulkInserter} from '../common/bulk-inserter.interface.js';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import {emptyStepResult} from '../common/step-result.js';
import type {StepResult} from '../common/step-result.js';
import {
  SpfModuleDefinitionSchema,
  type SpfModuleDefinitionRow,
} from '../../../entity-schema/definitions/module/spf/spf-module-definition.schema.js';
import {
  SpfModuleParameterDefinitionSchema,
  type SpfModuleParameterDefinitionRow,
} from '../../../entity-schema/definitions/module/spf/spf-module-parameter-definition.schema.js';
import {
  ModuleAttributeSchema,
  type ModuleAttributeRow,
} from '../../../entity-schema/definitions/module/spf/module-attribute.schema.js';
import {
  DataPortGroupSchema,
  type DataPortGroupRow,
} from '../../../entity-schema/definitions/module/spf/data-group-definition.schema.js';
import {
  DataPortDefinitionSchema,
  type DataPortDefinitionRow,
} from '../../../entity-schema/definitions/module/spf/data-port-definition.schema.js';
import {
  StaticControlPortDefinitionSchema,
  type StaticControlPortDefinitionRow,
} from '../../../entity-schema/definitions/module/spf/static-control-port-definition.schema.js';
import {
  StaticIntentDefinitionSchema,
  type StaticIntentDefinitionRow,
} from '../../../entity-schema/definitions/module/spf/static-intent-definition.schema.js';
import {
  DynamicIntentDefinitionSchema,
  type DynamicIntentDefinitionRow,
} from '../../../entity-schema/definitions/module/spf/dynamic-intent-definition.schema.js';
import {
  ModuleDefinitionContainerTypeLinkSchema,
  type ModuleDefinitionContainerTypeLinkRow,
} from '../../../entity-schema/definitions/module/spf/module-definition-container-type-link.schema.js';
type DataPortGroupDefinition = SpfModuleDefinition['dataPortGroups'][number];
type StaticControlPortDefinition =
  SpfModuleDefinition['staticControlPorts'][number];

interface DataPortGroupStepResult {
  stepResult: StepResult;
  groupToGeneratedSystemId: Map<DataPortGroupDefinition, number>;
}

interface StaticControlPortStepResult {
  stepResult: StepResult;
  portToGeneratedSystemId: Map<StaticControlPortDefinition, number>;
}

export class SpfModuleDefinitionInserter implements BulkInserter<SpfModuleDefinition> {
  constructor(
    private readonly manager: EntityManager,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async insert(items: SpfModuleDefinition[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const moduleBySystemId = new Map(items.map(m => [m.systemId, m]));

    const rootStep = await this.insertSpfModuleDefinitions(items);
    const activeItems = items.filter(
      i => !rootStep.failedEntityIds.has(i.systemId),
    );

    const [
      paramsResult,
      attrsResult,
      dataGroupResult,
      staticPortResult,
      dynamicIntentResult,
      containerTypeLinkResult,
    ] = await Promise.all([
      this.insertParams(activeItems),
      this.insertAttributes(activeItems),
      this.insertDataPortGroups(activeItems),
      this.insertStaticControlPorts(activeItems),
      this.insertDynamicIntents(activeItems),
      this.insertContainerTypeLinks(activeItems),
    ]);

    const failedGroupIds = dataGroupResult.stepResult.failedEntityIds;
    const failedPortIds = staticPortResult.stepResult.failedEntityIds;

    const dataPortDefsResult = await this.insertDataPortDefinitions(
      activeItems,
      failedGroupIds,
      dataGroupResult.groupToGeneratedSystemId,
    );
    const staticIntentsResult = await this.insertStaticIntents(
      activeItems,
      failedPortIds,
      staticPortResult.portToGeneratedSystemId,
    );

    const allRawFailures: RawFailure[] = [
      ...rootStep.rawFailures,
      ...paramsResult.rawFailures,
      ...attrsResult.rawFailures,
      ...dataGroupResult.stepResult.rawFailures,
      ...staticPortResult.stepResult.rawFailures,
      ...dynamicIntentResult.rawFailures,
      ...containerTypeLinkResult.rawFailures,
      ...dataPortDefsResult.rawFailures,
      ...staticIntentsResult.rawFailures,
    ];

    return groupRawFailures(
      allRawFailures,
      moduleBySystemId,
      mod =>
        `SpfModuleDefinition (moduleDefinitionId=${BinaryUtils.toHexString(mod.naturalId)}, name='${mod.name}')`,
    );
  }

  private async insertSpfModuleDefinitions(
    items: SpfModuleDefinition[],
  ): Promise<StepResult> {
    const rows: InsertRow<SpfModuleDefinitionRow>[] = items.map(mod => ({
      systemId: mod.systemId,
      naturalId: mod.naturalId,
      name: mod.name,
      displayName: mod.displayName,
      description: mod.description,
      groupName: mod.groupName,
      modSearchKeys: mod.modSearchKeys,
      stackSize: mod.stackSize,
      fileSystemId: mod.fileSystemId,
      metadata: mod.metadata,
      processorSystemId: mod.processorSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      SpfModuleDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const mod = items.find(m => m.systemId === error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: mod.systemId,
        entityLabel: 'SpfModuleDefinition',
        failedRowJson: `(moduleDefinitionId=${BinaryUtils.toHexString(mod.naturalId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  private async insertParams(
    items: SpfModuleDefinition[],
  ): Promise<StepResult> {
    const contextBySystemId = new Map<
      number,
      {mod: SpfModuleDefinition; paramNaturalId: number}
    >();

    const rows: InsertRow<SpfModuleParameterDefinitionRow>[] = items.flatMap(
      mod =>
        mod.parameters.map(param => {
          const row: InsertRow<SpfModuleParameterDefinitionRow> = {
            systemId: param.systemId,
            naturalId: param.naturalId,
            name: param.name,
            description: param.description,
            maxSize: param.maxSize ?? 0,
            pidType: param.pidType,
            isPersistent: param.isPersistent,
            elementsStructure: param.elementsStructure,
            isReadOnly: param.isReadOnly,
            toolPolicies:
              param.toolPolicies.length > 0
                ? JSON.stringify(param.toolPolicies)
                : undefined,
            copySrcParamNaturalId: param.copySrcParamNaturalId,
            spfModuleDefinitionSystemId: mod.systemId,
          };
          contextBySystemId.set(param.systemId, {
            mod,
            paramNaturalId: param.naturalId,
          });
          return row;
        }),
    );

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      SpfModuleParameterDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: ctx.mod.systemId,
        entityLabel: 'SpfModuleParameterDefinition',
        failedRowJson: `(moduleDefinitionId=${BinaryUtils.toHexString(ctx.mod.naturalId)}, paramId=${BinaryUtils.toHexString(ctx.paramNaturalId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  private async insertAttributes(
    items: SpfModuleDefinition[],
  ): Promise<StepResult> {
    const contextBySystemId = new Map<
      number,
      {mod: SpfModuleDefinition; attrName: string}
    >();

    const rows: InsertRow<ModuleAttributeRow>[] = [];

    for (const mod of items) {
      for (const [name, value] of mod.attributes) {
        const systemId = await this.idGeneration.getNextId(mod.fileSystemId);
        const row: InsertRow<ModuleAttributeRow> = {
          systemId,
          name,
          value,
          moduleDefinitionSystemId: mod.systemId,
        };
        contextBySystemId.set(systemId, {mod, attrName: name});
        rows.push(row);
      }
    }

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      ModuleAttributeSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: ctx.mod.systemId,
        entityLabel: 'ModuleAttribute',
        failedRowJson: `(moduleDefinitionId=${BinaryUtils.toHexString(ctx.mod.naturalId)}, attrName='${ctx.attrName}') Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  private async insertDataPortGroups(
    items: SpfModuleDefinition[],
  ): Promise<DataPortGroupStepResult> {
    const groupToGeneratedSystemId = new Map<DataPortGroupDefinition, number>();
    const contextBySystemId = new Map<
      number,
      {
        mod: SpfModuleDefinition;
        group: DataPortGroupDefinition;
        idx: number;
      }
    >();

    const rows: InsertRow<DataPortGroupRow>[] = [];

    for (const mod of items) {
      for (let idx = 0; idx < mod.dataPortGroups.length; idx++) {
        const group = mod.dataPortGroups[idx];
        const systemId = await this.idGeneration.getNextId(mod.fileSystemId);
        groupToGeneratedSystemId.set(group, systemId);
        contextBySystemId.set(systemId, {mod, group, idx});
        rows.push({
          systemId,
          maxAllowedPortCount: group.maxAllowedPortCount,
          portIoType: group.portIoType,
          moduleDefinitionSystemId: mod.systemId,
        });
      }
    }

    if (rows.length === 0) {
      return {stepResult: emptyStepResult(), groupToGeneratedSystemId};
    }

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DataPortGroupSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: ctx.mod.systemId,
        entityLabel: 'DataPortGroup',
        failedRowJson: `(moduleDefinitionId=${BinaryUtils.toHexString(ctx.mod.naturalId)}, portIoType=${ctx.group.portIoType}, groupIndex=${ctx.idx}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      stepResult: {
        rawFailures,
        failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
      },
      groupToGeneratedSystemId,
    };
  }

  private async insertStaticControlPorts(
    items: SpfModuleDefinition[],
  ): Promise<StaticControlPortStepResult> {
    const portToGeneratedSystemId = new Map<
      StaticControlPortDefinition,
      number
    >();
    const contextBySystemId = new Map<
      number,
      {mod: SpfModuleDefinition; port: StaticControlPortDefinition}
    >();

    const rows: InsertRow<StaticControlPortDefinitionRow>[] = [];

    for (const mod of items) {
      for (const port of mod.staticControlPorts) {
        const systemId = await this.idGeneration.getNextId(mod.fileSystemId);
        portToGeneratedSystemId.set(port, systemId);
        contextBySystemId.set(systemId, {mod, port});
        rows.push({
          systemId,
          naturalId: port.naturalId,
          portName: port.portName,
          moduleDefinitionSystemId: mod.systemId,
        });
      }
    }

    if (rows.length === 0) {
      return {stepResult: emptyStepResult(), portToGeneratedSystemId};
    }

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      StaticControlPortDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: ctx.mod.systemId,
        entityLabel: 'StaticControlPortDefinition',
        failedRowJson: `(moduleDefinitionId=${BinaryUtils.toHexString(ctx.mod.naturalId)}, portId=${BinaryUtils.toHexString(ctx.port.naturalId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      stepResult: {
        rawFailures,
        failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
      },
      portToGeneratedSystemId,
    };
  }

  private async insertDynamicIntents(
    items: SpfModuleDefinition[],
  ): Promise<StepResult> {
    const contextBySystemId = new Map<
      number,
      {mod: SpfModuleDefinition; intentNaturalId: number}
    >();

    const rows: InsertRow<DynamicIntentDefinitionRow>[] = [];

    for (const mod of items) {
      for (const intent of mod.dynamicIntents) {
        const systemId = await this.idGeneration.getNextId(mod.fileSystemId);
        contextBySystemId.set(systemId, {
          mod,
          intentNaturalId: intent.naturalId,
        });
        rows.push({
          systemId,
          naturalId: intent.naturalId,
          name: intent.name,
          maxPort: intent.maxPort,
          moduleDefinitionSystemId: mod.systemId,
        });
      }
    }

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DynamicIntentDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: ctx.mod.systemId,
        entityLabel: 'DynamicIntentDefinition',
        failedRowJson: `(moduleDefinitionId=${BinaryUtils.toHexString(ctx.mod.naturalId)}, intentId=${BinaryUtils.toHexString(ctx.intentNaturalId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  private async insertContainerTypeLinks(
    items: SpfModuleDefinition[],
  ): Promise<StepResult> {
    const allRows: ModuleDefinitionContainerTypeLinkRow[] = items.flatMap(mod =>
      [...mod.containerTypesSystemIds].map(containerTypeSystemId => ({
        moduleDefinitionSystemId: mod.systemId,
        containerTypeSystemId,
      })),
    );

    if (allRows.length === 0) return emptyStepResult();

    const rawFailures: RawFailure[] = [];

    try {
      await this.manager.insert(
        ModuleDefinitionContainerTypeLinkSchema,
        allRows,
      );
    } catch {
      for (const row of allRows) {
        try {
          await this.manager.insert(
            ModuleDefinitionContainerTypeLinkSchema,
            row,
          );
        } catch (rowError: unknown) {
          const mod = items.find(
            m => m.systemId === row.moduleDefinitionSystemId,
          )!;
          rawFailures.push({
            systemId: mod.systemId,
            entityLabel: 'ModuleDefinitionContainerTypeLink',
            failedRowJson: `(moduleDefinitionId=${BinaryUtils.toHexString(mod.naturalId)}) Row: ${JSON.stringify(row)}`,
            dbError:
              rowError instanceof Error ? rowError.message : String(rowError),
          });
        }
      }
    }

    return {
      rawFailures,
      failedEntityIds: new Set<number>(),
    };
  }

  private async insertDataPortDefinitions(
    items: SpfModuleDefinition[],
    failedGroupIds: Set<number>,
    groupToGeneratedSystemId: Map<DataPortGroupDefinition, number>,
  ): Promise<StepResult> {
    const contextBySystemId = new Map<
      number,
      {mod: SpfModuleDefinition; dataPortNaturalId: number}
    >();

    const rows: InsertRow<DataPortDefinitionRow>[] = [];

    for (const mod of items) {
      for (const group of mod.dataPortGroups) {
        const groupSystemId = groupToGeneratedSystemId.get(group);
        if (groupSystemId === undefined || failedGroupIds.has(groupSystemId)) {
          continue;
        }
        for (const port of group.staticPortDefinitions) {
          const systemId = await this.idGeneration.getNextId(mod.fileSystemId);
          contextBySystemId.set(systemId, {
            mod,
            dataPortNaturalId: port.naturalId,
          });
          rows.push({
            systemId,
            naturalId: port.naturalId,
            name: port.name,
            dataPortGroupSystemId: groupSystemId,
          });
        }
      }
    }

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DataPortDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: ctx.mod.systemId,
        entityLabel: 'DataPortDefinition',
        failedRowJson: `(moduleDefinitionId=${BinaryUtils.toHexString(ctx.mod.naturalId)}, dataPortId=${BinaryUtils.toHexString(ctx.dataPortNaturalId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  private async insertStaticIntents(
    items: SpfModuleDefinition[],
    failedPortIds: Set<number>,
    portToGeneratedSystemId: Map<StaticControlPortDefinition, number>,
  ): Promise<StepResult> {
    const contextBySystemId = new Map<
      number,
      {mod: SpfModuleDefinition; portNaturalId: number; intentNaturalId: number}
    >();

    const rows: InsertRow<StaticIntentDefinitionRow>[] = [];

    for (const mod of items) {
      for (const port of mod.staticControlPorts) {
        const portSystemId = portToGeneratedSystemId.get(port);
        if (portSystemId === undefined || failedPortIds.has(portSystemId)) {
          continue;
        }
        for (const intent of port.staticIntents) {
          contextBySystemId.set(intent.systemId, {
            mod,
            portNaturalId: port.naturalId,
            intentNaturalId: intent.naturalId,
          });
          rows.push({
            systemId: intent.systemId,
            naturalId: intent.naturalId,
            name: intent.name,
            staticControlPortDefinitionSystemId: portSystemId,
          });
        }
      }
    }

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      StaticIntentDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: ctx.mod.systemId,
        entityLabel: 'StaticIntentDefinition',
        failedRowJson: `(moduleDefinitionId=${BinaryUtils.toHexString(ctx.mod.naturalId)}, portId=${BinaryUtils.toHexString(ctx.portNaturalId)}, intentId=${BinaryUtils.toHexString(ctx.intentNaturalId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }
}
