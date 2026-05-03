/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {BulkInsertResult, PropertyDefinition} from '@arc/core';
import {okBulkInsert, BinaryUtils} from '@arc/core';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import {
  ContainerPropertyDefinitionSchema,
  type ContainerPropertyRow,
} from '../../../entity-schema/definitions/container/container-property-definition.schema.js';

export class ContainerPropertyDefinitionInserter {
  constructor(private readonly manager: EntityManager) {}

  async insert(items: PropertyDefinition[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const aggregateById = new Map<number, PropertyDefinition>(
      items.map(item => [item.systemId, item]),
    );

    const rows: InsertRow<ContainerPropertyRow>[] = items.map(item => ({
      systemId: item.systemId,
      propertyId: item.propertyId,
      name: item.name,
      propertyType: item.type,
      description: item.description,
      elementsStructure: item.elementsStructure,
      maxSize: item.maxSize ?? 0,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      ContainerPropertyDefinitionSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const item = aggregateById.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: item.systemId,
        entityLabel: `ContainerPropertyDefinition (propertyId=${BinaryUtils.toHexString(item.propertyId)})`,
        failedRowJson: `(propertyId=${BinaryUtils.toHexString(item.propertyId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return groupRawFailures(
      rawFailures,
      aggregateById,
      item =>
        `ContainerPropertyDefinition (propertyId=${BinaryUtils.toHexString(item.propertyId)})`,
    );
  }
}
