/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  type SubgraphPropertyDefQueryService,
  type SubgraphPropertyDefinitionSummaryReadModel,
  type SubgraphPropertyDefinitionReadModel,
  type SubgraphPropertyDefinitionWithElementsReadModel,
  type ISessionRepository,
  Result,
  ERROR_CODES,
  IssueSeverity,
} from '@arc/core';
import {OverlayMergeImpl} from '../edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {
  SubgraphPropertyBase,
  SubgraphPropertyRow,
} from '../../entity-schema/definitions/subgraph/subgraph-property-definition.schema.js';
import {SubgraphPropertyDefinitionFetcher} from '../../fetchers/definitions/subgraph-property-definition-fetcher.js';

const overlay = new OverlayMergeImpl();

export class DbSubgraphPropertyDefQueryService implements SubgraphPropertyDefQueryService {
  private readonly fetcher: SubgraphPropertyDefinitionFetcher;

  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {
    this.fetcher = new SubgraphPropertyDefinitionFetcher(
      dataSource,
      editActionsSvc,
      sessionRepo,
    );
  }

  /**
   * Returns every subgraph property definition for the given fileSystemId.
   * Overlay always applied — no applyOverlay flag, matching DbContainerPropertyDefQueryService.
   */
  async getAllSubgraphPropertyDefinitionsSummary(
    fileSystemId: number,
    propertyNaturalId?: number,
  ): Promise<Result<SubgraphPropertyDefinitionSummaryReadModel[]>> {
    try {
      const rows = await this.fetcher.fetchAll(fileSystemId);

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
    row: SubgraphPropertyBase,
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
    row: SubgraphPropertyBase,
  ): SubgraphPropertyDefinitionReadModel {
    return {
      ...this.toSummaryReadModel(row),
      maxSize: row.maxSize,
    };
  }

  async getAllDetailedSubgraphPropertyDefinitionsWithElements(
    fileSystemId: number,
  ): Promise<Result<SubgraphPropertyDefinitionWithElementsReadModel[]>> {
    try {
      const rows = await this.fetcher.fetchAll(fileSystemId);
      return Result.ok(rows.map(r => this.toDetailWithElementsReadModel(r)));
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load subgraph property definitions with elements',
        severity: IssueSeverity.Error,
      });
    }
  }

  private toDetailWithElementsReadModel(
    row: SubgraphPropertyBase,
  ): SubgraphPropertyDefinitionWithElementsReadModel {
    return {
      systemId: row.systemId,
      propertyId: row.propertyId,
      name: row.name,
      description: row.description,
      propertyType: row.propertyType,
      maxSize: row.maxSize,
      isVoice: row.isVoice ?? false,
      elementsStructure: row.elementsStructure ?? '',
    };
  }
}
