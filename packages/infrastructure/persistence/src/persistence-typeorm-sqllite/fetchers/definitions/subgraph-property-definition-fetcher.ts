/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {OverlayMergeImpl} from '../../queries/edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {ISessionRepository} from '@arc/core';
import type {SubgraphPropertyBase} from '../../entity-schema/definitions/subgraph/subgraph-property-definition.schema.js';

const overlay = new OverlayMergeImpl();

export class SubgraphPropertyDefinitionFetcher {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {}

  async fetchAll(fileSystemId: number): Promise<SubgraphPropertyBase[]> {
    const baselineRows = (await this.dataSource
      .getRepository(ENTITY_NAMES.SubgraphPropertyDefinition)
      .createQueryBuilder('sp')
      .where('sp.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as unknown as SubgraphPropertyBase[];

    const session =
      await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);

    if (!session) return baselineRows;

    return overlay
      .applyToCollection(
        baselineRows as unknown as Array<{systemId: number}>,
        await this.editActionsSvc.getByTable(
          session.sessionId,
          ENTITY_NAMES.SubgraphPropertyDefinition,
        ),
      )
      .map(r => r.effective as unknown as SubgraphPropertyBase);
  }
}
