/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  type SubgraphPropertyDefQueryService,
  type SubgraphPropertyDefinitionSummaryReadModel,
  type SubgraphPropertyDefinitionReadModel,
  type ISessionRepository,
  Result,
  ERROR_CODES,
  IssueSeverity,
} from '@arc/core';
import {OverlayMergeImpl} from '../edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {SubgraphPropertyRow} from '../../entity-schema/definitions/subgraph/subgraph-property-definition.schema.js';

const overlay = new OverlayMergeImpl();

export class DbSubgraphPropertyDefQueryService implements SubgraphPropertyDefQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {}

  /**
   * Returns every subgraph property definition for the given fileSystemId.
   * Overlay always applied — no applyOverlay flag, matching DbContainerPropertyDefQueryService.
   */
  async getAllSubgraphPropertyDefinitions(
    fileSystemId: number,
    propertyNaturalId?: number,
  ): Promise<Result<SubgraphPropertyDefinitionSummaryReadModel[]>> {
    try {
      // Step 1 — baseline load, all subgraph property definitions scoped to this file
      const baselineRows = (await this.dataSource
        .getRepository(ENTITY_NAMES.SubgraphPropertyDefinition)
        .createQueryBuilder('sp')
        .where('sp.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany()) as SubgraphPropertyRow[];

      // Step 2 — Overlay: table-wide query, not one call per row
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const rows = session
        ? overlay
            .applyToCollection(
              baselineRows,
              await this.editActionsSvc.getByTable(
                session.sessionId,
                ENTITY_NAMES.SubgraphPropertyDefinition,
              ),
            )
            .map(r => r.effective)
        : baselineRows;

      // Step 3 — in-memory filter by natural id, after overlay merge
      const filtered =
        propertyNaturalId === undefined
          ? rows
          : rows.filter(r => r.propertyId === propertyNaturalId);

      return Result.ok(filtered.map(r => this.toSummaryReadModel(r)));
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load subgraph property definitions',
        severity: IssueSeverity.Error,
      });
    }
  }

  /**
   * Returns a single subgraph property definition by systemId.
   * Resolution order: DB row first, then session overlay.
   */
  async getSubgraphPropertyDefinition(
    propertySystemId: number,
    fileSystemId: number,
  ): Promise<Result<SubgraphPropertyDefinitionReadModel>> {
    try {
      const baseRow = (await this.dataSource
        .getRepository(ENTITY_NAMES.SubgraphPropertyDefinition)
        .createQueryBuilder('sp')
        .where('sp.systemId = :propertySystemId', {propertySystemId})
        .getOne()) as SubgraphPropertyRow | null;

      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const baseRows = baseRow ? [baseRow] : [];
      let rows = baseRows;
      if (session) {
        const actions = await this.editActionsSvc.getByTable(
          session.sessionId,
          ENTITY_NAMES.SubgraphPropertyDefinition,
        );
        rows = overlay
          .applyToCollection(
            baseRows,
            actions.filter(a => a.targetSystemId === propertySystemId),
          )
          .map(r => r.effective);
      }

      const match = rows[0];
      return match
        ? Result.ok(this.toDetailReadModel(match))
        : Result.fail({
            code: ERROR_CODES.ENTITY_NOT_FOUND,
            message: `SubgraphPropertyDefinition not found for systemId=${propertySystemId}`,
            severity: IssueSeverity.Error,
          });
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load subgraph property definition',
        severity: IssueSeverity.Error,
      });
    }
  }

  private toSummaryReadModel(
    row: SubgraphPropertyRow,
  ): SubgraphPropertyDefinitionSummaryReadModel {
    return {
      systemId: row.systemId,
      propertyId: row.propertyId,
      name: row.name,
      description: row.description,
      propertyType: row.propertyType,
      isVoice: row.isVoice,
    };
  }

  private toDetailReadModel(
    row: SubgraphPropertyRow,
  ): SubgraphPropertyDefinitionReadModel {
    return {
      ...this.toSummaryReadModel(row),
      maxSize: row.maxSize,
    };
  }
}
