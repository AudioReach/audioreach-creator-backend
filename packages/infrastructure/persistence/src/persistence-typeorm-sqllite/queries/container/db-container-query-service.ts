/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
/* eslint-disable sonarjs/deprecation -- TODO(LLD3): migrate to OverlayMergeImpl; these services use compat shims pending read-service rewrite */

import type {DataSource} from 'typeorm';
import {
  type ContainerQueryService,
  type ContainerReadModel,
  Result,
  ERROR_CODES,
  IssueSeverity,
} from '@arc/core';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {ContainerRow} from '../../entity-schema/usecase-data/container/container.schema.js';

export class DbContainerQueryService implements ContainerQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns every container for the given fileSystemId.
   * Overlay always applied — no applyOverlay flag.
   */
  async findAll(fileSystemId: number): Promise<Result<ContainerReadModel[]>> {
    try {
      // Step 1 — baseline load
      const baselineRows = (await this.dataSource
        .getRepository(ENTITY_NAMES.Container)
        .createQueryBuilder('c')
        .select(['c.systemId', 'c.containerId', 'c.containerTypeSystemId'])
        .where('c.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany()) as ContainerRow[];

      // Step 2 — overlay
      const session = await this.editActionsSvc.findActiveSession(fileSystemId);
      const rows = session
        ? applyToCollection(
            baselineRows,
            await this.editActionsSvc.getByTable(
              session.sessionId,
              ENTITY_NAMES.Container,
            ),
          )
        : baselineRows;

      // Step 3 — resolve container type names in one batch query
      const typeIds = [
        ...new Set(
          rows
            .map(r => r.containerTypeSystemId)
            .filter((id): id is number => !!id),
        ),
      ];
      const typeNameMap = new Map<number, string>();
      if (typeIds.length > 0) {
        const typeRows = (await this.dataSource
          .getRepository('ContainerType')
          .createQueryBuilder('ct')
          .select(['ct.systemId', 'ct.name'])
          .whereInIds(typeIds)
          .getMany()) as Array<{systemId: number; name: string}>;
        for (const t of typeRows) typeNameMap.set(t.systemId, t.name);
      }

      // Step 4 — assemble ContainerReadModel[]
      return Result.ok(
        rows.map(
          r =>
            ({
              systemId: r.systemId,
              containerId: r.containerId,
              containerTypeSystemId: r.containerTypeSystemId ?? null,
              containerTypeName: r.containerTypeSystemId
                ? (typeNameMap.get(r.containerTypeSystemId) ?? null)
                : null,
            }) satisfies ContainerReadModel,
        ),
      );
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error ? error.message : 'Failed to query containers',
        severity: IssueSeverity.Error,
      });
    }
  }
}
