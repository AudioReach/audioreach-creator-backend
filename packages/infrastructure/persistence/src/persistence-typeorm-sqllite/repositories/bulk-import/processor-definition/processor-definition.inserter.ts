/* Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries. SPDX-License-Identifier: BSD-3-Clause */

import type {EntityManager} from 'typeorm';
import type {BulkInsertResult, ProcessorDefinition} from '@arc/core';
import {okBulkInsert, BinaryUtils} from '@arc/core';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import {
  ProcessorDefinitionSchema,
  type ProcessorDefinitionRow,
} from '../../../entity-schema/definitions/common/processor-definition.schema.js';

export class ProcessorDefinitionInserter {
  constructor(private readonly manager: EntityManager) {}

  async insert(items: ProcessorDefinition[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const aggregateById = new Map<number, ProcessorDefinition>(
      items.map(item => [item.systemId, item]),
    );

    const rows: InsertRow<ProcessorDefinitionRow>[] = items.map(item => ({
      systemId: item.systemId,
      processorDefinitionId: item.processorDefinitionId,
      name: item.name,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      ProcessorDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const item = aggregateById.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: item.systemId,
        entityLabel: `ProcessorDefinition (processorDefinitionId=${BinaryUtils.toHexString(item.processorDefinitionId)})`,
        failedRowJson: `(processorDefinitionId=${BinaryUtils.toHexString(item.processorDefinitionId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return groupRawFailures(
      rawFailures,
      aggregateById,
      item =>
        `ProcessorDefinition (processorDefinitionId=${BinaryUtils.toHexString(item.processorDefinitionId)})`,
    );
  }
}
