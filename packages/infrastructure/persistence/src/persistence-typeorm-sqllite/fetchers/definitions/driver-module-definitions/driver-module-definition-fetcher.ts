/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {applyTableOverlay} from '../../../queries/edit-session/overlay-utils.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';

interface DriverModuleDefinitionBase {
  systemId: number;
  moduleDefinitionId: number;
  name: string;
  description?: string;
  groupName?: string;
  fileSystemId: number;
}

export interface OverlaidDriverModuleDefinition {
  systemId: number;
  moduleDefinitionId: number;
  name: string;
  description: string | undefined;
  groupName: string | undefined;
  fileSystemId: number;
}

/**
 * Fetches driver_module_definitions root row with session overlay applied.
 *
 * Child table (driver_module_parameter_definitions) is owned by
 * DriverModuleParameterDefinitionFetcher — not loaded here.
 *
 * Existence of child rows depends on this root being present — callers must
 * verify fetchOne is non-null before calling child fetchers (FR-8 Rule 1).
 */
export class DriverModuleDefinitionFetcher {
  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns the overlaid driver module definition for the given system ID,
   * or null if it was deleted in the session or does not exist.
   */
  async fetchOne(
    defSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidDriverModuleDefinition | null> {
    const baseRow = (await this.manager
      .getRepository(ENTITY_NAMES.DriverModuleDefinition)
      .createQueryBuilder('def')
      .select([
        'def.systemId',
        'def.moduleDefinitionId',
        'def.name',
        'def.description',
        'def.groupName',
        'def.fileSystemId',
      ])
      .where(
        'def.systemId = :defSystemId AND def.fileSystemId = :fileSystemId',
        {defSystemId, fileSystemId},
      )
      .getOne()) as unknown as DriverModuleDefinitionBase | null;

    if (sessionId === null) {
      return baseRow ? this.toOverlaid(baseRow) : null;
    }

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      defSystemId,
    );

    const overlaid = applyTableOverlay(
      baseRow as unknown as {systemId: number} | null,
      actions,
      ENTITY_NAMES.DriverModuleDefinition,
    ) as DriverModuleDefinitionBase | null;

    if (overlaid === null) return null;

    // Handle CREATE — no base row exists yet
    if (baseRow === null) {
      const createAction = actions.find(
        a =>
          a.targetTable === ENTITY_NAMES.DriverModuleDefinition &&
          a.operation === CHANGE_OPERATION.Create,
      );
      if (!createAction) return null;
      const p = createAction.newValue as Partial<DriverModuleDefinitionBase>;
      return {
        systemId: createAction.targetSystemId,
        moduleDefinitionId: p.moduleDefinitionId ?? 0,
        name: p.name ?? '',
        description: p.description,
        groupName: p.groupName,
        fileSystemId: p.fileSystemId ?? fileSystemId,
      };
    }

    return this.toOverlaid(overlaid);
  }

  /**
   * Returns the system IDs of driver module definitions matching the given
   * filters from the baseline table. Used by list query methods to scope
   * subsequent fetcher calls — same pattern as
   * SpfModuleDefinitionFetcher.resolveBaseDefinitionIds.
   */
  async getBaseDefinitionIds(
    fileSystemId: number,
    filters: {
      moduleDefinitionNaturalId?: number;
      parameterNaturalId?: number;
    },
  ): Promise<number[]> {
    const qb = this.manager
      .getRepository(ENTITY_NAMES.DriverModuleDefinition)
      .createQueryBuilder('def')
      .select('def.systemId')
      .where('def.fileSystemId = :fileSystemId', {fileSystemId});

    if (filters.moduleDefinitionNaturalId !== undefined) {
      qb.andWhere('def.moduleDefinitionId = :moduleDefinitionId', {
        moduleDefinitionId: filters.moduleDefinitionNaturalId,
      });
    }
    if (filters.parameterNaturalId !== undefined) {
      // Non-correlated IN subquery with raw column names avoids TypeORM
      // property-mapping and subquery-context issues with EntityManager builders.
      qb.andWhere(
        `"def"."system_id" IN (
          SELECT "driver_module_definition_system_id"
          FROM "driver_module_parameter_definitions"
          WHERE "parameter_id" = :paramNaturalId
        )`,
        {paramNaturalId: filters.parameterNaturalId},
      );
    }

    const rows = (await qb.getMany()) as Array<{systemId: number}>;
    return rows.map(r => r.systemId);
  }

  private toOverlaid(
    r: DriverModuleDefinitionBase,
  ): OverlaidDriverModuleDefinition {
    return {
      systemId: r.systemId,
      moduleDefinitionId: r.moduleDefinitionId,
      name: r.name,
      description: r.description,
      groupName: r.groupName,
      fileSystemId: r.fileSystemId,
    };
  }
}
