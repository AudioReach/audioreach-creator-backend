/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {OverlayMergeImpl} from '../../queries/edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {ContainerPropertyBase} from '../../entity-schema/definitions/container/container-property-definition.schema.js';

/**
 * Fetches container_property_definitions for a file with session overlay applied.
 *
 * Follows the standard fetcher pattern (FR-3):
 *   - Constructor: EntityManager + EditActionsQueryService only.
 *     Previously accepted DataSource + ISessionRepository; changed to EntityManager
 *     so the fetcher matches every other fetcher in this layer and can be used
 *     inside a transaction context if needed.
 *   - sessionId is a caller parameter, not resolved internally.
 *     The caller (query service) looks up the active session once and passes it
 *     down — this avoids an extra DB round-trip per fetcher call and keeps
 *     session resolution a single responsibility of the service layer.
 */
export class ContainerPropertyDefinitionFetcher {
  // Instance-level, not module-level, so each fetcher instance is independent.
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns all container property definitions for the given file.
   * When sessionId is provided, CREATE/UPDATE/DELETE overlay from edit_actions
   * is applied before returning. When null, baseline rows are returned as-is.
   */
  async fetchAll(
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<ContainerPropertyBase[]> {
    const baselineRows = (await this.manager
      .getRepository(ENTITY_NAMES.ContainerProperty)
      .createQueryBuilder('cp')
      .where('cp.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as unknown as ContainerPropertyBase[];

    if (sessionId === null) return baselineRows;

    // One edit_actions query covers all property definitions in the session —
    // same pattern used by ContainerOverlayFetcher and SubgraphOverlayFetcher.
    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.ContainerProperty,
    );

    return this.overlay
      .applyToCollection(
        baselineRows as unknown as Array<{systemId: number}>,
        actions,
      )
      .map(r => r.effective as unknown as ContainerPropertyBase);
  }
}
