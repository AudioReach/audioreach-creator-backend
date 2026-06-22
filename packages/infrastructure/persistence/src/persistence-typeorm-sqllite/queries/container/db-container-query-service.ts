/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {ContainerQueryService, ContainerReadModel} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import type {ContainerRow} from '../../entity-schema/usecase-data/container/container.schema.js';

/**
 * Database implementation of ContainerQueryService.
 *
 * findMany/findOne: load container identity (systemId, containerId, type)
 * with three-tier edit session overlay — container type can be staged
 * for change within an active session.
 *
 * editActionsSvc is also used by getProperties() (future) to overlay
 * container_property_data rows.
 */
export class DbContainerQueryService implements ContainerQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async findMany(
    systemIds: number[],
    fileSystemId: number,
    applyOverlay = true,
  ): Promise<ContainerReadModel[]> {
    if (systemIds.length === 0) return [];

    const baseRows = (await this.dataSource
      .getRepository(ENTITY_NAMES.Container)
      .createQueryBuilder('c')
      .select(['c.systemId', 'c.containerId', 'c.type'])
      .where('c.systemId IN (:...ids)', {ids: systemIds})
      .andWhere('c.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as ContainerRow[];

    // SQL:
    // SELECT c.system_id, c.container_id, c.type
    // FROM containers c
    // WHERE c.system_id IN (?) AND c.file_system_id = ?

    if (baseRows.length === 0) return [];

    // Three-tier overlay — container type can be staged for change in a session
    const session = applyOverlay
      ? await this.editActionsSvc.findActiveSession(fileSystemId)
      : null;

    let rows = baseRows;
    if (session) {
      const allActions = await Promise.all(
        baseRows.map(r =>
          this.editActionsSvc.getEditActionsByAggregateId(
            session.sessionId,
            r.systemId,
          ),
        ),
      );
      const flatActions = allActions
        .flat()
        .filter(a => a.tableName === ENTITY_NAMES.Container);

      if (flatActions.length > 0) {
        rows = applyToCollection(baseRows, flatActions);
      }
    }

    return rows.map(r => ({
      systemId:    r.systemId,
      containerId: r.containerId,
      type:        r.type,
    }));
  }

  async findOne(
    systemId: number,
    fileSystemId: number,
    applyOverlay = true,
  ): Promise<ContainerReadModel | null> {
    const results = await this.findMany([systemId], fileSystemId, applyOverlay);
    return results[0] ?? null;
  }
}
