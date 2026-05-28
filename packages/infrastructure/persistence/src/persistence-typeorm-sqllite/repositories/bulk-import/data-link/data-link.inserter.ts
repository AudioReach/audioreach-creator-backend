/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {BulkInsertResult, DataLink} from '@arc/core';
import {okBulkInsert, BinaryUtils} from '@arc/core';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import type {StepResult} from '../common/step-result.js';
import {
  DataLinkSchema,
  type DataLinkRow,
} from '../../../entity-schema/usecase-data/Links/data-link.js';

export class DataLinkInserter {
  constructor(private readonly manager: EntityManager) {}

  async insert(items: DataLink[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const bySystemId = new Map(items.map(i => [i.systemId, i]));
    const step = await this.insertDataLinks(items);

    return groupRawFailures(
      step.rawFailures,
      bySystemId,
      item =>
        `DataLink (sourcePort=${BinaryUtils.toHexString(item.sourcePortSystemId)}, destPort=${BinaryUtils.toHexString(item.destinationPortSystemId)})`,
    );
  }

  private async insertDataLinks(items: DataLink[]): Promise<StepResult> {
    const rows: InsertRow<DataLinkRow>[] = items.map(item => ({
      systemId: item.systemId,
      sourceNodeSystemId: item.sourceNodeSystemId,
      destinationNodeSystemId: item.destinationNodeSystemId,
      sourcePortSystemId: item.sourcePortSystemId,
      destinationPortSystemId: item.destinationPortSystemId,
      linkType: item.linkType,
      sourceSubgraphSystemId: item.sourceSubgraphSystemId,
      destSubgraphSystemId: item.destSubgraphSystemId,
      isEc: item.isEc ?? null,
      fileSystemId: item.fileSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      DataLinkSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const item = items.find(i => i.systemId === error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: item.systemId,
        entityLabel: 'DataLink',
        failedRowJson: `(sourcePort=${BinaryUtils.toHexString(item.sourcePortSystemId)}, destPort=${BinaryUtils.toHexString(item.destinationPortSystemId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }
}
