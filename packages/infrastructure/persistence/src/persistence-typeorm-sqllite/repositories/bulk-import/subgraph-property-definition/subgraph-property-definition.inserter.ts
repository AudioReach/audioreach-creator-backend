/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {BulkInsertResult, SubgraphPropertyDefinition} from '@arc/core';
import {okBulkInsert, BinaryUtils} from '@arc/core';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import {
  SubgraphPropertyDefinitionSchema,
  type SubgraphPropertyRow,
} from '../../../entity-schema/definitions/subgraph/subgraph-property-definition.schema.js';

export class SubgraphPropertyDefinitionInserter {
  constructor(private readonly manager: EntityManager) {}

  async insert(items: SubgraphPropertyDefinition[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const aggregateById = new Map<number, SubgraphPropertyDefinition>(
      items.map(item => [item.systemId, item]),
    );

    const rows: InsertRow<SubgraphPropertyRow>[] = items.map(item => ({
      systemId: item.systemId,
      fileSystemId: item.fileSystemId,
      propertyId: item.propertyId,
      name: item.name,
      propertyType: item.type,
      description: item.description,
      elementsStructure: item.elementsStructure,
      maxSize: item.maxSize ?? 0,
      isVoice: item.isVoice,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      SubgraphPropertyDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const item = aggregateById.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: item.systemId,
        entityLabel: 'SubgraphPropertyDefinition',
        failedRowJson: `(propertyId=${BinaryUtils.toHexString(item.propertyId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return groupRawFailures(
      rawFailures,
      aggregateById,
      item =>
        `SubgraphPropertyDefinition (propertyId=${BinaryUtils.toHexString(item.propertyId)})`,
    );
  }
}
