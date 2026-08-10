/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  type ContainerPropertyDefQueryService,
  type PropertyDefinitionSummaryReadModel,
  type PropertyDefinitionReadModel,
  type ContainerPropertyDefinitionWithElementsReadModel,
  type ISessionRepository,
  Result,
  ERROR_CODES,
  IssueSeverity,
} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {ContainerPropertyBase} from '../../entity-schema/definitions/container/container-property-definition.schema.js';
import {ContainerPropertyDefinitionFetcher} from '../../fetchers/definitions/container-property-definition-fetcher.js';

/**
 * Query service for container property definitions.
 *
 * All overlay is delegated to ContainerPropertyDefinitionFetcher (FR-3).
 * Previously, getContainerPropertyDefinition applied applyToCollection and
 * queried edit_actions inline — this violated FR-3 by bypassing the fetcher.
 * Now, every method resolves the session once and passes sessionId to the
 * fetcher, keeping overlay logic out of the service layer.
 */
export class DbContainerPropertyDefQueryService implements ContainerPropertyDefQueryService {
  private readonly fetcher: ContainerPropertyDefinitionFetcher;

  constructor(
    dataSource: DataSource,
    editActionsSvc: EditActionsQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {
    // Pass dataSource.manager to match the standard fetcher constructor pattern
    // (EntityManager + EditActionsQueryService — no DataSource, no sessionRepo).
    this.fetcher = new ContainerPropertyDefinitionFetcher(
      dataSource.manager,
      editActionsSvc,
    );
  }

  /**
   * Returns every container property definition for the given fileSystemId.
   * Overlay always applied via fetcher. Optionally filtered by natural propertyId.
   */
  async getAllContainerPropertyDefinitionsSummary(
    fileSystemId: number,
    propertyNaturalId?: number,
  ): Promise<Result<PropertyDefinitionSummaryReadModel[]>> {
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
            : 'Failed to load container property definitions',
        severity: IssueSeverity.Error,
      });
    }
  }

  /**
   * Returns a single container property definition by systemId.
   *
   * Delegates overlay to fetcher and filters the result in memory (FR-3).
   * Previously applied applyToCollection and queried edit_actions inline —
   * that path is replaced by fetchAll + in-memory find.
   */
  async getContainerPropertyDefinition(
    propertySystemId: number,
    fileSystemId: number,
  ): Promise<Result<PropertyDefinitionReadModel>> {
    try {
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const rows = await this.fetcher.fetchAll(
        fileSystemId,
        session?.sessionId ?? null,
      );

      // fetchAll already applies overlay for the whole file — filter in memory
      // rather than issuing a separate targeted query.
      const match = rows.find(r => r.systemId === propertySystemId);

      return match
        ? Result.ok(this.toDetailReadModel(match))
        : Result.fail({
            code: ERROR_CODES.ENTITY_NOT_FOUND,
            message: `ContainerPropertyDefinition not found for systemId=${propertySystemId}`,
            severity: IssueSeverity.Error,
          });
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load container property definition',
        severity: IssueSeverity.Error,
      });
    }
  }

  /**
   * Returns all container property definitions with their full element
   * structure included.
   */
  async getAllDetailedContainerPropertyDefinitionsWithElements(
    fileSystemId: number,
  ): Promise<Result<ContainerPropertyDefinitionWithElementsReadModel[]>> {
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
            : 'Failed to load container property definitions',
        severity: IssueSeverity.Error,
      });
    }
  }

  // ── Private read model mappers ─────────────────────────────────────────────

  private toSummaryReadModel(
    row: ContainerPropertyBase,
  ): PropertyDefinitionSummaryReadModel {
    return {
      systemId: row.systemId,
      propertyId: row.propertyId,
      name: row.name,
      description: row.description,
      propertyType: row.propertyType,
    };
  }

  private toDetailReadModel(
    row: ContainerPropertyBase,
  ): PropertyDefinitionReadModel {
    return {
      ...this.toSummaryReadModel(row),
      maxSize: row.maxSize,
    };
  }

  private toDetailWithElementsReadModel(
    row: ContainerPropertyBase,
  ): ContainerPropertyDefinitionWithElementsReadModel {
    return {
      ...this.toDetailReadModel(row),
      elementsStructure: row.elementsStructure ?? '',
    };
  }
}
