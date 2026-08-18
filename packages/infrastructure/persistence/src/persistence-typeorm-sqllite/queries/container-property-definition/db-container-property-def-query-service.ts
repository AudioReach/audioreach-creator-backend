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
import type {
  ContainerPropertyBase,
  ContainerPropertyRow,
} from '../../entity-schema/definitions/container/container-property-definition.schema.js';
import {ContainerPropertyDefinitionFetcher} from '../../fetchers/definitions/container-property-definition-fetcher.js';
import {OverlayMergeImpl} from '../edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';

const overlay = new OverlayMergeImpl();

export class DbContainerPropertyDefQueryService implements ContainerPropertyDefQueryService {
  private readonly fetcher: ContainerPropertyDefinitionFetcher;

  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {
    this.fetcher = new ContainerPropertyDefinitionFetcher(
      dataSource,
      editActionsSvc,
      sessionRepo,
    );
  }

  /**
   * Returns every container property definition for the given fileSystemId.
   * Overlay always applied — no applyOverlay flag, matching DbContainerQueryService.getAllContainers.
   */
  async getAllContainerPropertyDefinitionsSummary(
    fileSystemId: number,
    propertyNaturalId?: number,
  ): Promise<Result<PropertyDefinitionSummaryReadModel[]>> {
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
            : 'Failed to load container property definitions',
        severity: IssueSeverity.Error,
      });
    }
  }

  /**
   * Returns a single container property definition by systemId.
   * Resolution order: DB row first, then session overlay.
   */
  async getContainerPropertyDefinition(
    propertySystemId: number,
    fileSystemId: number,
  ): Promise<Result<PropertyDefinitionReadModel>> {
    try {
      const baseRow = (await this.dataSource
        .getRepository(ENTITY_NAMES.ContainerProperty)
        .createQueryBuilder('cp')
        .where('cp.systemId = :propertySystemId', {propertySystemId})
        .getOne()) as ContainerPropertyRow | null;

      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const baseRows = baseRow ? [baseRow] : [];
      let rows = baseRows;
      if (session) {
        const actions = await this.editActionsSvc.getByTable(
          session.sessionId,
          ENTITY_NAMES.ContainerProperty,
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

  async getAllDetailedContainerPropertyDefinitionsWithElements(
    fileSystemId: number,
  ): Promise<Result<ContainerPropertyDefinitionWithElementsReadModel[]>> {
    try {
      const rows = await this.fetcher.fetchAll(fileSystemId);
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

  private toDetailWithElementsReadModel(
    row: ContainerPropertyBase,
  ): ContainerPropertyDefinitionWithElementsReadModel {
    return {
      systemId: row.systemId,
      propertyId: row.propertyId,
      name: row.name,
      description: row.description,
      propertyType: row.propertyType,
      maxSize: row.maxSize,
      elementsStructure: row.elementsStructure ?? '',
    };
  }
}
