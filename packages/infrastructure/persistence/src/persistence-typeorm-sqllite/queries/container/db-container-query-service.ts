/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  type ContainerQueryService,
  type ContainerReadModel,
  type ISessionRepository,
  type PropertyPayloadReadModel,
  Result,
  ERROR_CODES,
  IssueSeverity,
} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {ContainerOverlayFetcher} from '../../fetchers/container-overlay-fetcher.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';

export class DbContainerQueryService implements ContainerQueryService {
  private readonly containerFetcher: ContainerOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsSvc: EditActionsQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {
    this.containerFetcher = new ContainerOverlayFetcher(
      dataSource.manager,
      editActionsSvc,
    );
  }

  /**
   * Returns every container for the given fileSystemId.
   * Overlay always applied — no applyOverlay flag.
   */
  async findAll(fileSystemId: number): Promise<Result<ContainerReadModel[]>> {
    try {
      // Step 1+2 — load baseline and apply overlay via fetcher
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const rows = await this.containerFetcher.applyToContainers(
        fileSystemId,
        session?.sessionId ?? null,
      );

      // Step 3 — resolve container type names in one batch query.
      // ContainerType is a static definition loaded from the .awsp file — not
      // session-aware, no edit actions, no overlay fetcher needed.
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
          .getRepository(ENTITY_NAMES.ContainerType)
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

  async findPropertyPayloads(
    containerSystemId: number,
    fileSystemId: number,
  ): Promise<Result<PropertyPayloadReadModel[] | null>> {
    try {
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const overlaid = await this.containerFetcher.fetchOne(
        containerSystemId,
        fileSystemId,
        session?.sessionId ?? null,
      );
      if (!overlaid) return Result.ok(null);
      return Result.ok(
        overlaid.properties.map(p => ({
          systemId: p.systemId,
          propertySystemId: p.propertySystemId,
          payload: p.payload as Uint8Array | null,
        })),
      );
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load container properties',
        severity: IssueSeverity.Error,
      });
    }
  }
}
