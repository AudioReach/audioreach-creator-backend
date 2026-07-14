/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {BulkInsertResult, ContainerType} from '@arc/core';
import {errBulkInsert, okBulkInsert, BinaryUtils} from '@arc/core';
import type {BulkInserter} from '../common/bulk-inserter.interface.js';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {
  ContainerTypeSchema,
  type ContainerTypeRow,
} from '../../../entity-schema/definitions/container/container-definition.schema.js';

export class ContainerTypeInserter implements BulkInserter<ContainerType> {
  constructor(private readonly manager: EntityManager) {}

  public async insert(items: ContainerType[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const aggregateById = new Map<number, ContainerType>(
      items.map(item => [item.systemId, item]),
    );

    const rows: InsertRow<ContainerTypeRow>[] = items.map(item => ({
      systemId: item.systemId,
      name: item.name,
      value: item.value,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      ContainerTypeSchema,
      rows,
    );

    if (failedEntities.length === 0) return okBulkInsert();

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const item = aggregateById.get(error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId);
      return {
        systemId: item.systemId,
        entityLabel: `ContainerType (value=${BinaryUtils.toHexString(item.value)}, name='${item.name}')`,
        failedRowJson: `(value=${BinaryUtils.toHexString(item.value)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return errBulkInsert(
      rawFailures.map(f => ({
        systemId: f.systemId,
        message: `Failed to insert ${f.entityLabel}`,
        details: `${f.entityLabel}: ${f.dbError}\n  ${f.failedRowJson}`,
      })),
    );
  }
}
