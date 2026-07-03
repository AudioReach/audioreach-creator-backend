/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
/* eslint-disable sonarjs/deprecation -- TODO(LLD3): migrate to OverlayMergeImpl; these services use compat shims pending read-service rewrite */

import type {DataSource} from 'typeorm';
import type {
  DriverModuleDefinitionQueryService,
  BaseModuleDefinitionSummaryReadModel,
  ParameterDefinitionSummaryReadModel,
} from '@arc/core';
import {Result, ERROR_CODES, IssueSeverity} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {applyToCollection} from '../edit-session/overlay-merge.js';
import {applyTableOverlay} from '../edit-session/overlay-utils.js';
import type {DriverModuleDefinitionRow} from '../../entity-schema/definitions/module/driver/driver-module-definition.schema.js';
import type {DriverModuleParameterDefinitionRow} from '../../entity-schema/definitions/module/driver/driver-module-parameter-definition.schema.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';

/**
 * Database implementation of DriverModuleDefinitionQueryService.
 *
 * Three-layer overlay pattern (docs/superpowers/specs/query-service-overlay-pattern.md):
 * DB Query (buildBaseQueryBuilder) → Overlay (overlayDriverModuleDefinitionRow /
 * overlayParameters, pure, no DB) → Mapping (mapSummary /
 * toParameterSummaryReadModel, pure, no DB, no overlay).
 *
 * loadSummaryReadModels issues one getByAggregateId call per module, run
 * concurrently — aggregate-scoped rather than table-scoped, mirroring
 * DbSpfModuleDefinitionQueryService's loadOverlaidDefinitionRows. Trades a
 * fixed O(1) query count for O(N), each call scoped to exactly one module's
 * own actions with no session-wide over-fetch.
 */
export class DbDriverModuleDefinitionQueryService implements DriverModuleDefinitionQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async getAllDriverModuleDefinitions(
    fileSystemId: number,
    filters: {
      moduleDefinitionNaturalId?: number;
      parameterNaturalId?: number;
    },
  ): Promise<Result<BaseModuleDefinitionSummaryReadModel[]>> {
    try {
      const qb = this.buildBaseQueryBuilder(fileSystemId);

      if (filters.moduleDefinitionNaturalId !== undefined) {
        qb.andWhere('def.moduleDefinitionId = :moduleDefinitionId', {
          moduleDefinitionId: filters.moduleDefinitionNaturalId,
        });
      }
      if (filters.parameterNaturalId !== undefined) {
        qb.andWhere(
          `EXISTS ${qb
            .subQuery()
            .select('1')
            .from(ENTITY_NAMES.DriverModuleParameterDefinition, 'p2')
            .where('p2.driverModuleDefinitionSystemId = def.systemId')
            .andWhere('p2.parameterId = :parameterId')
            .getQuery()}`,
          {parameterId: filters.parameterNaturalId},
        );
      }

      const data = await this.loadSummaryReadModels(qb, fileSystemId);
      return Result.ok(data);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to load driver module definitions for fileSystemId=${fileSystemId}, filters=${JSON.stringify(filters)}`,
        severity: IssueSeverity.Error,
      });
    }
  }

  async getDriverModuleDefinition(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<Result<BaseModuleDefinitionSummaryReadModel>> {
    try {
      const qb = this.buildBaseQueryBuilder(fileSystemId).andWhere(
        'def.systemId = :moduleSystemId',
        {moduleSystemId},
      );

      const data = await this.loadSummaryReadModels(qb, fileSystemId);
      const match = data.find(d => d.systemId === moduleSystemId);
      if (!match) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `DriverModuleDefinition not found for systemId=${moduleSystemId}`,
          severity: IssueSeverity.Error,
        });
      }

      return Result.ok(match);
    } catch (error) {
      return Result.fail({
        code: ERROR_CODES.INTERNAL_ERROR,
        message:
          error instanceof Error
            ? error.message
            : `Failed to load driver module definition ${moduleSystemId}`,
        severity: IssueSeverity.Error,
      });
    }
  }

  // ── private helpers ──────────────────────────────────────────────────────

  private buildBaseQueryBuilder(fileSystemId: number) {
    return this.dataSource
      .getRepository(ENTITY_NAMES.DriverModuleDefinition)
      .createQueryBuilder('def')
      .where('def.fileSystemId = :fileSystemId', {fileSystemId})
      .leftJoinAndSelect('def.parameters', 'param');
  }

  private async loadSummaryReadModels(
    qb: ReturnType<
      DbDriverModuleDefinitionQueryService['buildBaseQueryBuilder']
    >,
    fileSystemId: number,
  ): Promise<BaseModuleDefinitionSummaryReadModel[]> {
    const rows = (await qb.getMany()) as DriverModuleDefinitionRow[];
    if (rows.length === 0) return [];

    const session = await this.editActionsSvc.findActiveSession(fileSystemId);
    const sessionId = session?.sessionId ?? null;

    if (sessionId === null) {
      return rows.map(row => this.mapSummary(row, row.parameters ?? []));
    }

    const actionsByRow = await Promise.all(
      rows.map(row =>
        this.editActionsSvc.getByAggregateId(sessionId, row.systemId),
      ),
    );

    return rows.map((row, index) => {
      const actions = actionsByRow[index];
      const overlaidDef = this.overlayDriverModuleDefinitionRow(row, actions);
      const overlaidParams = this.overlayParameters(
        row.parameters ?? [],
        actions,
      );

      return this.mapSummary(overlaidDef, overlaidParams);
    });
  }

  // ── Overlay methods (Layer 2 — pure, no DB) ──────────────────────────────

  private overlayDriverModuleDefinitionRow(
    row: DriverModuleDefinitionRow,
    actions: EditActionRow[],
  ): DriverModuleDefinitionRow {
    return (
      applyTableOverlay(row, actions, ENTITY_NAMES.DriverModuleDefinition) ??
      row
    );
  }

  private overlayParameters(
    rows: DriverModuleParameterDefinitionRow[],
    actions: EditActionRow[],
  ): DriverModuleParameterDefinitionRow[] {
    return applyToCollection(
      rows,
      actions.filter(
        a => a.targetTable === ENTITY_NAMES.DriverModuleParameterDefinition,
      ),
    );
  }

  // ── Mapping methods (Layer 3 — pure, no DB, no overlay) ──────────────────

  private mapSummary(
    row: DriverModuleDefinitionRow,
    params: DriverModuleParameterDefinitionRow[],
  ): BaseModuleDefinitionSummaryReadModel {
    return {
      systemId: row.systemId,
      moduleId: row.moduleDefinitionId,
      name: row.name ?? '',
      displayName: undefined, // no column yet — LLD §6.1
      description: row.description,
      parameterDefinitions: params.map(p =>
        this.toParameterSummaryReadModel(p),
      ),
      deprecated: undefined, // no column yet — LLD §6.1
    };
  }

  private toParameterSummaryReadModel(
    row: DriverModuleParameterDefinitionRow,
  ): ParameterDefinitionSummaryReadModel {
    return {
      systemId: row.systemId,
      paramId: row.parameterId,
      name: row.name,
      description: row.description,
      isHidden: false, // no DTO field yet — LLD §6.2
      isReadOnly: false, // no column yet — LLD §6.2
      deprecated: false, // no DTO field yet — LLD §6.2
      toolPolicies: '', // no column yet — LLD §6.2
      pidType: '', // no column yet — LLD §6.2
    };
  }
}
