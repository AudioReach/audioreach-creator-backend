/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {
  type ContainerPropertyDefQueryService,
  type PropertyDefinitionSummaryReadModel,
  type PropertyDefinitionReadModel,
  type ISessionRepository,
  Result,
  ERROR_CODES,
  IssueSeverity,
} from '@arc/core';
import {OverlayMergeImpl} from '../edit-session/overlay-merge.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import type {ContainerPropertyRow} from '../../entity-schema/definitions/container/container-property-definition.schema.js';

const overlay = new OverlayMergeImpl();

export class DbContainerPropertyDefQueryService implements ContainerPropertyDefQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
    private readonly sessionRepo: ISessionRepository,
  ) {}

  /**
   * Returns every container property definition for the given fileSystemId.
   * Overlay always applied — no applyOverlay flag, matching DbContainerQueryService.findAll.
   */
  async getAllContainerPropertyDefinitions(
    fileSystemId: number,
    propertyNaturalId?: number,
  ): Promise<Result<PropertyDefinitionSummaryReadModel[]>> {
    try {
      // Step 1 — baseline load, all container property definitions scoped to this file
      const baselineRows = (await this.dataSource
        .getRepository(ENTITY_NAMES.ContainerProperty)
        .createQueryBuilder('cp')
        .where('cp.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany()) as ContainerPropertyRow[];

      // Step 2 — Overlay: table-wide query, not one call per row
      const session =
        await this.sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      const rows = session
        ? overlay
            .applyToCollection(
              baselineRows,
              await this.editActionsSvc.getByTable(
                session.sessionId,
                ENTITY_NAMES.ContainerProperty,
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
    row: ContainerPropertyRow,
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
    row: ContainerPropertyRow,
  ): PropertyDefinitionReadModel {
    return {
      ...this.toSummaryReadModel(row),
      maxSize: row.maxSize,
    };
  }
}
