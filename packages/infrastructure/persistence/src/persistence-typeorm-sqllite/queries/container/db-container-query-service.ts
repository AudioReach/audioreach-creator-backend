/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {
  type BatchRead,
  type ContainerQueryService,
  type ContainerReadModel,
  type IdentifiedEntityRef,
  type PropertyPayloadReadModel,
  Result,
  ENTITY_TYPE,
  ERROR_CODES,
  IssueSeverity,
} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {ContainerOverlayFetcher} from '../../fetchers/container-overlay-fetcher.js';
import {ContainerPropertyDataFetcher} from '../../fetchers/container-property-data-fetcher.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {withCommittedFallback} from '../../utils/with-committed-fallback.js';
import {withNotFound} from '../../utils/with-not-found.js';
import {inRequestOrder} from '../../utils/in-request-order.js';

export class DbContainerQueryService implements ContainerQueryService {
  // Protected: TypeOrmContainerRepository uses it as well.
  protected readonly containerFetcher: ContainerOverlayFetcher;

  constructor(
    protected readonly manager: EntityManager,
    editActionsSvc: EditActionsQueryService,
  ) {
    this.containerFetcher = new ContainerOverlayFetcher(
      manager,
      editActionsSvc,
      new ContainerPropertyDataFetcher(manager, editActionsSvc),
    );
  }

  /**
   * Returns every or selected container for the given fileSystemId.
   * Overlay always applied — no applyOverlay flag.
   */
  async getAllContainers(
    fileSystemId: number,
    systemIds?: number[],
  ): Promise<Result<ContainerReadModel[]>> {
    try {
      // Step 1+2 — load baseline and apply overlay via fetcher
      const rows = await this.containerFetcher.fetchMany(
        fileSystemId,
        await resolveActiveSessionId(this.manager, fileSystemId),
      );
      const selectedRows =
        systemIds === undefined
          ? rows
          : rows.filter(row => systemIds.includes(row.systemId));

      // Step 3 — assemble ContainerReadModel[]
      return Result.ok(
        selectedRows.map(
          r =>
            ({
              systemId: r.systemId,
              naturalId: r.naturalId,
              containerTypeSystemId: null,
              containerTypeName: null,
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
      const overlaid = await this.containerFetcher.fetchOne(
        containerSystemId,
        fileSystemId,
        await resolveActiveSessionId(this.manager, fileSystemId),
      );
      if (!overlaid) return Result.ok(null);
      return Result.ok(
        overlaid.properties.map(p => ({
          systemId: p.systemId,
          propertySystemId: p.propertySystemId,
          payload: p.payload,
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

  async findContainerIdentities(
    fileSystemId: number,
    containerSystemIds: readonly number[],
  ): Promise<
    BatchRead<
      IdentifiedEntityRef<typeof ENTITY_TYPE.Container>,
      typeof ENTITY_TYPE.Container
    >
  > {
    const requested = [...new Set(containerSystemIds)];
    if (requested.length === 0)
      return {entityType: ENTITY_TYPE.Container, items: [], failed: []};

    return withCommittedFallback(
      await resolveActiveSessionId(this.manager, fileSystemId),
      requested,
      async (sessionId, ids) => {
        const containers = await this.containerFetcher.fetchMany(
          fileSystemId,
          sessionId,
          {systemId: [...ids]},
        );
        const items = inRequestOrder(
          ids,
          containers.map(container => ({
            entityType: ENTITY_TYPE.Container,
            systemId: container.systemId,
            identity: {naturalId: container.naturalId},
          })),
        );
        return withNotFound(
          ENTITY_TYPE.Container,
          ids,
          items,
          item => item.systemId,
        );
      },
    );
  }
}
