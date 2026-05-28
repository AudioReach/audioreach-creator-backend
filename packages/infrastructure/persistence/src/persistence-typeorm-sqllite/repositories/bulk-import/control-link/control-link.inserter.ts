/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {BulkInsertResult, ControlLink} from '@arc/core';
import {okBulkInsert, BinaryUtils} from '@arc/core';
import {
  BatchInserter,
  type InsertRow,
  type RawFailure,
} from '../batch-inserter.js';
import {groupRawFailures} from '../common/group-raw-failures.js';
import type {StepResult} from '../common/step-result.js';
import {
  ControlLinkSchema,
  type ControlLinkRow,
} from '../../../entity-schema/usecase-data/Links/control-link.js';

export class ControlLinkInserter {
  constructor(private readonly manager: EntityManager) {}

  async insert(items: ControlLink[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const bySystemId = new Map(items.map(i => [i.systemId, i]));
    const step = await this.insertControlLinks(items);

    return groupRawFailures(
      step.rawFailures,
      bySystemId,
      item =>
        `ControlLink (peerNodeA=${BinaryUtils.toHexString(item.peerNodeASystemId)}, peerNodeB=${BinaryUtils.toHexString(item.peerNodeBSystemId)})`,
    );
  }

  private async insertControlLinks(items: ControlLink[]): Promise<StepResult> {
    const rows: InsertRow<ControlLinkRow>[] = items.map(item => ({
      systemId: item.systemId,
      fileSystemId: item.fileSystemId,
      peerNodeASystemId: item.peerNodeASystemId,
      peerNodeBSystemId: item.peerNodeBSystemId,
      nodeAPortSystemId: item.nodeAPortSystemId,
      nodeBPortSystemId: item.nodeBPortSystemId,
      heapId: item.heapId,
      linkType: item.linkType,
      sourceSubgraphSystemId: item.sourceSubgraphSystemId,
      destSubgraphSystemId: item.destSubgraphSystemId,
    }));

    const {failedEntities} = await BatchInserter.insert(
      this.manager,
      ControlLinkSchema,
      rows,
    );

    const rawFailures: RawFailure[] = failedEntities.map(error => {
      const item = items.find(i => i.systemId === error.systemId)!;
      const row = rows.find(r => r.systemId === error.systemId)!;
      return {
        systemId: item.systemId,
        entityLabel: 'ControlLink',
        failedRowJson: `(peerNodeA=${BinaryUtils.toHexString(item.peerNodeASystemId)}, peerNodeB=${BinaryUtils.toHexString(item.peerNodeBSystemId)}) Row: ${JSON.stringify(row)}`,
        dbError: error.message,
      };
    });

    return {
      rawFailures,
      failedEntityIds: new Set(failedEntities.map(e => e.systemId)),
    };
  }
}
