/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {OverlayMergeImpl} from '../../queries/edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {SubgraphPropertyBase} from '../../entity-schema/definitions/subgraph/subgraph-property-definition.schema.js';

/**
 * Fetches subgraph_property_definitions for a file with session overlay applied.
 *
 * Follows the standard fetcher pattern (FR-3):
 *   - Constructor: EntityManager + EditActionsQueryService only.
 *     Previously accepted DataSource + ISessionRepository; changed to EntityManager
 *     so the fetcher matches every other fetcher in this layer.
 *   - sessionId is a caller parameter, not resolved internally.
 *     The caller (query service) looks up the active session once and passes it
 *     down — avoids an extra DB round-trip per fetcher call.
 */
export class SubgraphPropertyDefinitionFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns all subgraph property definitions for the given file.
   * When sessionId is provided, CREATE/UPDATE/DELETE overlay from edit_actions
   * is applied before returning. When null, baseline rows are returned as-is.
   */
  async fetchAll(
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<SubgraphPropertyBase[]> {
    const baselineRows = (await this.manager
      .getRepository(ENTITY_NAMES.SubgraphPropertyDefinition)
      .createQueryBuilder('sp')
      .where('sp.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as unknown as SubgraphPropertyBase[];

    if (sessionId === null) return baselineRows;

    const actions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.SubgraphPropertyDefinition,
    );

    return this.overlay
      .applyToCollection(
        baselineRows as unknown as Array<{systemId: number}>,
        actions,
      )
      .map(r => r.effective as unknown as SubgraphPropertyBase);
  }
}
