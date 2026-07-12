/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {BulkInsertResult, ModuleManagerData} from '@arc/core';
import {okBulkInsert, BinaryUtils} from '@arc/core';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import type {StepResult} from '../common/step-result.js';
import {
  ModuleManagerDataSchema,
  type ModuleManagerDataRow,
} from '../../../entity-schema/module-manager/module-manager-data.js';

export class ModuleManagerDataInserter {
  constructor(private readonly manager: EntityManager) {}

  async insert(items: readonly ModuleManagerData[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const bySystemId = new Map(items.map(i => [i.systemId, i]));
    const step = await this.insertModuleManagerData(items);

    return groupRawFailures(
      step.rawFailures,
      bySystemId,
      item =>
        `ModuleManagerData (moduleId=${BinaryUtils.toHexString(item.moduleDefinitionSystemId)})`,
    );
  }

  private async insertModuleManagerData(
    items: readonly ModuleManagerData[],
  ): Promise<StepResult> {
    const rows: InsertRow<ModuleManagerDataRow>[] = items.map(item => ({
      systemId: item.systemId,
      moduleDefinitionSystemId: item.moduleDefinitionSystemId,
      fileSystemId: item.fileSystemId,
      moduleType: item.moduleType,
      interfaceType: item.interfaceType,
      interfaceVersion: item.interfaceVersion,
      fileName: item.fileName,
      tag: item.tag,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      ModuleManagerDataSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const item = items.find(i => i.systemId === error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: item.systemId,
        entityLabel: 'ModuleManagerData',
        failedRowJson: `(moduleId=${BinaryUtils.toHexString(item.moduleDefinitionSystemId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }
}
