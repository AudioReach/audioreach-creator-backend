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
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {SubgraphPropertyBase} from '../../entity-schema/definitions/subgraph/subgraph-property-definition.schema.js';
import {SubgraphPropertyDefinitionFetcher} from '../../fetchers/definitions/subgraph-property-definition-fetcher.js';

/**
 * Query service for subgraph property definitions.
 *
 * All overlay is delegated to SubgraphPropertyDefinitionFetcher (FR-3).
 * The service resolves the active session once per method and passes sessionId
 * to the fetcher — no inline applyToCollection or direct edit_actions queries.
 *
 * getSubgraphPropertyDefinition previously applied applyToCollection inline
 * with a direct table query; now delegates to fetcher.fetchAll and filters
 * in memory — same pattern as DbContainerPropertyDefQueryService (FR-3).
 */
export class DbSubgraphPropertyDefQueryService implements SubgraphPropertyDefQueryService {
  private readonly fetcher: SubgraphPropertyDefinitionFetcher;

  constructor(
    dataSource: DataSource,
    editActionsSvc: EditActionsQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {
    // Pass manager (not DataSource) to match the standard fetcher constructor
    // pattern: EntityManager + EditActionsQueryService.
    this.fetcher = new SubgraphPropertyDefinitionFetcher(
      dataSource.manager,
      editActionsSvc,
    );
  }

  /**
   * Returns every subgraph property definition for the given fileSystemId.
   * Overlay always applied via fetcher.
   */
  async getAllSubgraphPropertyDefinitionsSummary(
    fileSystemId: number,
    propertyNaturalId?: number,
  ): Promise<Result<SubgraphPropertyDefinitionSummaryReadModel[]>> {
    try {
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const rows = await this.fetcher.fetchAll(
        fileSystemId,
        session?.sessionId ?? null,
      );

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
   * Delegates overlay to fetcher — filters the full result set in memory
   * rather than issuing a separate single-entity query (FR-3).
   */
  async getSubgraphPropertyDefinition(
    propertySystemId: number,
    fileSystemId: number,
  ): Promise<Result<SubgraphPropertyDefinitionReadModel>> {
    try {
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const rows = await this.fetcher.fetchAll(
        fileSystemId,
        session?.sessionId ?? null,
      );

      // fetchAll already applies overlay for the whole file;
      // filter in memory rather than issuing a second targeted query.
      const match = rows.find(r => r.systemId === propertySystemId);

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

  async getAllDetailedSubgraphPropertyDefinitionsWithElements(
    fileSystemId: number,
  ): Promise<Result<SubgraphPropertyDefinitionWithElementsReadModel[]>> {
    try {
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const rows = await this.fetcher.fetchAll(
        fileSystemId,
        session?.sessionId ?? null,
      );
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

  // ── Private read model mappers ─────────────────────────────────────────────

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
