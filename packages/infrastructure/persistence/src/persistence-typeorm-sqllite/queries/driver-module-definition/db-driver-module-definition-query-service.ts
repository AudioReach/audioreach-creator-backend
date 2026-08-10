/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  DriverModuleDefinitionQueryService,
  BaseModuleDefinitionSummaryReadModel,
  ParameterDefinitionSummaryReadModel,
} from '@arc/core';
import {Result, ERROR_CODES, IssueSeverity} from '@arc/core';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {DriverModuleDefinitionFetcher} from '../../fetchers/definitions/driver-module-definitions/driver-module-definition-fetcher.js';
import type {DriverModuleDefinitionBase} from '../../entity-schema/definitions/module/driver/driver-module-definition.schema.js';
import {DriverModuleParameterDefinitionFetcher} from '../../fetchers/definitions/driver-module-definitions/driver-module-parameter-definition-fetcher.js';
import type {DriverModuleParameterDefinitionBase} from '../../entity-schema/definitions/module/driver/driver-module-parameter-definition.schema.js';

/**
 * Database implementation of DriverModuleDefinitionQueryService.
 *
 * All overlay delegated to two fetchers (FR-3):
 *   DriverModuleDefinitionFetcher          — root scalars with session overlay
 *   DriverModuleParameterDefinitionFetcher — parameters with session overlay
 *
 * DriverModuleDefinitionFetcher.fetchOne returning null is treated as a fatal
 * failure for that definition — parameters are not loaded (FR-8 Rule 1).
 */
export class DbDriverModuleDefinitionQueryService implements DriverModuleDefinitionQueryService {
  private readonly defFetcher: DriverModuleDefinitionFetcher;
  private readonly paramFetcher: DriverModuleParameterDefinitionFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsSvc: EditActionsQueryService,
  ) {
    this.defFetcher = new DriverModuleDefinitionFetcher(
      dataSource.manager,
      editActionsSvc,
    );
    this.paramFetcher = new DriverModuleParameterDefinitionFetcher(
      dataSource.manager,
      editActionsSvc,
    );
  }

  async getAllDriverModuleDefinitions(
    fileSystemId: number,
    filters: {
      moduleDefinitionNaturalId?: number;
      parameterNaturalId?: number;
    },
  ): Promise<Result<BaseModuleDefinitionSummaryReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Step 1 — resolve matching definition IDs via lean baseline scan (FR-3)
      const defSystemIds = await this.defFetcher.getBaseDefinitionIds(
        fileSystemId,
        filters,
      );
      if (defSystemIds.length === 0) return Result.ok([]);

      // Step 2 — bulk-load parameters for all definitions in one query (FR-5)
      const paramsByDef = await this.paramFetcher.fetchDriverModuleDefinitions(
        defSystemIds,
        sessionId,
      );

      // Step 3 — per-definition root fetch + assemble (FR-8 Rule 1 + Rule 3)
      const data: BaseModuleDefinitionSummaryReadModel[] = [];
      const missingSystemIds: number[] = [];

      for (const defId of defSystemIds) {
        const root = await this.defFetcher.fetchOne(
          defId,
          fileSystemId,
          sessionId,
        );

        // null = definition deleted in session (FR-8 Rule 1 — skip children)
        if (root === null) {
          missingSystemIds.push(defId);
          continue;
        }

        const params = paramsByDef.get(defId) ?? [];
        data.push(this.mapSummary(root, params));
      }

      if (missingSystemIds.length > 0) {
        return Result.partial(
          data,
          missingSystemIds.map(id => ({
            code: ERROR_CODES.ENTITY_NOT_FOUND,
            message: `DriverModuleDefinition not found for systemId=${id}`,
            severity: IssueSeverity.Error,
          })),
        );
      }

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
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      // Root first — if absent, do not load parameters (FR-8 Rule 1)
      const root = await this.defFetcher.fetchOne(
        moduleSystemId,
        fileSystemId,
        sessionId,
      );
      if (root === null) {
        return Result.fail({
          code: ERROR_CODES.ENTITY_NOT_FOUND,
          message: `DriverModuleDefinition not found for systemId=${moduleSystemId}`,
          severity: IssueSeverity.Error,
        });
      }

      const params = await this.paramFetcher.fetchDriverModuleDefinition(
        moduleSystemId,
        sessionId,
      );

      return Result.ok(this.mapSummary(root, params));
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

  // ── Private helpers ────────────────────────────────────────────────────────

  // ── Read model mappers ────────────────────────────────────────────────────

  private mapSummary(
    root: DriverModuleDefinitionBase,
    params: DriverModuleParameterDefinitionBase[],
  ): BaseModuleDefinitionSummaryReadModel {
    return {
      systemId: root.systemId,
      moduleId: root.moduleDefinitionId,
      name: root.name,
      displayName: undefined, // no column yet — LLD §6.1
      description: root.description,
      parameterDefinitions: params.map(p =>
        this.toParameterSummaryReadModel(p),
      ),
      deprecated: undefined, // no column yet — LLD §6.1
    };
  }

  private toParameterSummaryReadModel(
    p: DriverModuleParameterDefinitionBase,
  ): ParameterDefinitionSummaryReadModel {
    return {
      systemId: p.systemId,
      paramId: p.parameterId,
      name: p.name ?? '',
      description: p.description,
      isHidden: false, // no DTO field yet — LLD §6.2
      isReadOnly: false, // no column yet — LLD §6.2
      deprecated: false, // no DTO field yet — LLD §6.2
      toolPolicies: '', // no column yet — LLD §6.2
      pidType: '', // no column yet — LLD §6.2
    };
  }
}
