/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  BulkInsertResult,
  IdGenerationPort,
  VcpmModuleDefinition,
} from '@arc/core';
import {okBulkInsert, BinaryUtils} from '@arc/core';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import type {StepResult} from '../common/step-result.js';
import {
  VcpmModuleDefinitionSchema,
  type VcpmModuleDefinitionRow,
} from '../../../entity-schema/definitions/subgraph/vcpm/vcpm-module-definition.schema.js';
import {
  VcpmModuleParameterDefinitionSchema,
  type VcpmModuleParameterDefinitionRow,
} from '../../../entity-schema/definitions/subgraph/vcpm/vcpm-module-parameter-definition.schema.js';
import {
  VcpmModuleAttributeSchema,
  type VcpmModuleAttributeRow,
} from '../../../entity-schema/definitions/subgraph/vcpm/vcpm-module-attribute.schema.js';

function emptyStepResult(): StepResult {
  return {rawFailures: [], failedEntityIds: new Set()};
}

export class VcpmModuleDefinitionInserter {
  constructor(
    private readonly manager: EntityManager,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async insert(items: VcpmModuleDefinition[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const moduleBySystemId = new Map(items.map(m => [m.systemId, m]));

    const rootStep = await this.insertVcpmModuleDefinitions(items);
    const activeItems = items.filter(
      i => !rootStep.failedEntityIds.has(i.systemId),
    );

    const [paramsResult, attrsResult] = await Promise.all([
      this.insertParams(activeItems),
      this.insertAttributes(activeItems),
    ]);

    const allRawFailures: RawFailure[] = [
      ...rootStep.rawFailures,
      ...paramsResult.rawFailures,
      ...attrsResult.rawFailures,
    ];

    return groupRawFailures(
      allRawFailures,
      moduleBySystemId,
      mod =>
        `VcpmModuleDefinition (moduleDefinitionId=${BinaryUtils.toHexString(mod.moduleDefinitionId)}, name='${mod.name}')`,
    );
  }

  private async insertVcpmModuleDefinitions(
    items: VcpmModuleDefinition[],
  ): Promise<StepResult> {
    const rows: InsertRow<VcpmModuleDefinitionRow>[] = items.map(mod => ({
      systemId: mod.systemId,
      moduleDefinitionId: mod.moduleDefinitionId,
      fileSystemId: mod.fileSystemId,
      name: mod.name,
      displayName: mod.displayName,
      description: mod.description,
      groupName: mod.groupName,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      VcpmModuleDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const mod = items.find(m => m.systemId === error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: mod.systemId,
        entityLabel: 'VcpmModuleDefinition',
        failedRowJson: `(moduleDefinitionId=${BinaryUtils.toHexString(mod.moduleDefinitionId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  private async insertParams(
    items: VcpmModuleDefinition[],
  ): Promise<StepResult> {
    const contextBySystemId = new Map<
      number,
      {mod: VcpmModuleDefinition; paramId: number}
    >();

    const rows: InsertRow<VcpmModuleParameterDefinitionRow>[] = items.flatMap(
      mod =>
        mod.parameters.map(param => {
          const row: InsertRow<VcpmModuleParameterDefinitionRow> = {
            systemId: param.systemId,
            paramId: param.paramId,
            name: param.name,
            description: param.description,
            maxSize: param.maxSize ?? 0,
            pidType: param.pidType,
            isPersistent: param.isPersistent,
            isReadOnly: param.isReadOnly,
            elementsStructure: param.elementsStructure,
            toolPolicies:
              param.toolPolicies.length > 0
                ? JSON.stringify(param.toolPolicies)
                : undefined,
            vcpmModuleDefinitionSystemId: mod.systemId,
          };
          contextBySystemId.set(param.systemId, {mod, paramId: param.paramId});
          return row;
        }),
    );

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      VcpmModuleParameterDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: ctx.mod.systemId,
        entityLabel: 'VcpmModuleParameterDefinition',
        failedRowJson: `(moduleDefinitionId=${BinaryUtils.toHexString(ctx.mod.moduleDefinitionId)}, paramId=${BinaryUtils.toHexString(ctx.paramId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  private async insertAttributes(
    items: VcpmModuleDefinition[],
  ): Promise<StepResult> {
    const contextBySystemId = new Map<
      number,
      {mod: VcpmModuleDefinition; attrName: string}
    >();

    const rows: InsertRow<VcpmModuleAttributeRow>[] = [];

    for (const mod of items) {
      for (const [name, value] of mod.attributes) {
        const systemId = await this.idGeneration.getNextId(mod.fileSystemId);
        const row: InsertRow<VcpmModuleAttributeRow> = {
          systemId,
          name,
          value,
          vcpmModuleDefinitionSystemId: mod.systemId,
        };
        contextBySystemId.set(systemId, {mod, attrName: name});
        rows.push(row);
      }
    }

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      VcpmModuleAttributeSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: ctx.mod.systemId,
        entityLabel: 'VcpmModuleAttribute',
        failedRowJson: `(moduleDefinitionId=${BinaryUtils.toHexString(ctx.mod.moduleDefinitionId)}, attrName='${ctx.attrName}') Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }
}
