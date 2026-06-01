/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {BulkInsertResult, DriverModuleDefinition} from '@arc/core';
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
  DriverModuleDefinitionSchema,
  type DriverModuleDefinitionRow,
} from '../../../entity-schema/definitions/module/driver/driver-module-definition.schema.js';
import {
  DriverModuleParameterDefinitionSchema,
  type DriverModuleParameterDefinitionRow,
} from '../../../entity-schema/definitions/module/driver/driver-module-parameter-definition.schema.js';

/**
 * Bulk inserter for DriverModuleDefinition entities.
 * Follows the TDD pattern with FK-safe, leaf-first insertion order.
 */
export class DriverModuleDefinitionInserter implements BulkInserter<DriverModuleDefinition> {
  constructor(private readonly manager: EntityManager) {}

  async insert(
    definitions: DriverModuleDefinition[],
  ): Promise<BulkInsertResult> {
    if (definitions.length === 0) return okBulkInsert();

    const definitionBySystemId = new Map(definitions.map(d => [d.systemId, d]));

    const rootStep = await this.insertDriverModuleDefinitions(definitions);
    const activeItems = definitions.filter(
      i => !rootStep.failedEntityIds.has(i.systemId),
    );

    const paramsResult =
      await this.insertDriverModuleParameterDefinitions(activeItems);

    const allRawFailures: RawFailure[] = [
      ...rootStep.rawFailures,
      ...paramsResult.rawFailures,
    ];

    return groupRawFailures(
      allRawFailures,
      definitionBySystemId,
      mod =>
        `DriverModuleDefinition (moduleDefinitionId=${BinaryUtils.toHexString(mod.moduleDefinitionId)}, name='${mod.name}')`,
    );
  }

  private async insertDriverModuleDefinitions(
    items: DriverModuleDefinition[],
  ): Promise<StepResult> {
    const rows: InsertRow<DriverModuleDefinitionRow>[] = items.map(mod => ({
      systemId: mod.systemId,
      moduleDefinitionId: mod.moduleDefinitionId,
      name: mod.name,
      description: mod.description,
      groupName: mod.groupName,
      fileSystemId: mod.fileSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DriverModuleDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const mod = items.find(m => m.systemId === error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: mod.systemId,
        entityLabel: 'DriverModuleDefinition',
        failedRowJson: `(moduleDefinitionId=${BinaryUtils.toHexString(mod.moduleDefinitionId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }

  private async insertDriverModuleParameterDefinitions(
    items: DriverModuleDefinition[],
  ): Promise<StepResult> {
    const contextBySystemId = new Map<
      number,
      {mod: DriverModuleDefinition; paramId: number}
    >();

    const rows: InsertRow<DriverModuleParameterDefinitionRow>[] = items.flatMap(
      mod =>
        mod.parameters.map(param => {
          const row: InsertRow<DriverModuleParameterDefinitionRow> = {
            systemId: param.systemId,
            parameterId: param.parameterId,
            name: param.name,
            description: param.description,
            maxSize: param.maxSize,
            paramStructure: param.paramStructure,
            driverModuleDefinitionSystemId: mod.systemId,
          };
          contextBySystemId.set(param.systemId, {
            mod,
            paramId: param.parameterId,
          });
          return row;
        }),
    );

    if (rows.length === 0) return emptyStepResult();

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DriverModuleParameterDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const ctx = contextBySystemId.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: ctx.mod.systemId,
        entityLabel: 'DriverModuleParameterDefinition',
        failedRowJson: `(moduleDefinitionId=${BinaryUtils.toHexString(ctx.mod.moduleDefinitionId)}, paramId=${BinaryUtils.toHexString(ctx.paramId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }
}
