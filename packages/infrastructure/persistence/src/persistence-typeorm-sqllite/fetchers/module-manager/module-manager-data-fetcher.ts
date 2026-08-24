/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import type {
  InterfaceTypeValue,
  InterfaceVersionValue,
  ModuleTypeValue,
} from '../../entity-schema/module-manager/types.js';

interface ModuleManagerDataBase {
  systemId: number;
  moduleDefinitionSystemId: number;
  fileSystemId: number;
  moduleType: ModuleTypeValue;
  interfaceType: InterfaceTypeValue;
  interfaceVersion: InterfaceVersionValue;
  fileName: string;
  tag: string;
}

export interface OverlaidModuleManagerData {
  systemId: number;
  moduleDefinitionSystemId: number;
  fileSystemId: number;
  moduleType: ModuleTypeValue;
  interfaceType: InterfaceTypeValue;
  interfaceVersion: InterfaceVersionValue;
  fileName: string;
  tag: string;
}

/**
 * Fetches module_manager_data with session overlay applied.
 *
 * module_manager_data is a child of SpfModuleDefinition — its aggregateId in
 * edit_actions equals moduleDefinitionSystemId (the owning definition's PK).
 * Overlay is therefore scoped via getByAggregateId(sessionId, defSystemId)
 * for single-entity paths, and getByTable for bulk paths.
 *
 * Existence depends on the owning SpfModuleDefinition being present — callers
 * should verify the definition root first (FR-8 Rule 1).
 */
export class ModuleManagerDataFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns the overlaid module manager data for a single definition, or null
   * if no row exists (a missing row is valid — not all modules have custom metadata).
   */
  async fetchOne(
    moduleDefinitionSystemId: number,
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidModuleManagerData | null> {
    const baseRows = await this.loadBaseRows(
      [moduleDefinitionSystemId],
      fileSystemId,
    );

    if (sessionId === null) {
      return baseRows[0] ? this.toOverlaid(baseRows[0]) : null;
    }

    // aggregateId = moduleDefinitionSystemId; one call covers all rows for this def.
    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      moduleDefinitionSystemId,
    );
    const mmdActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.ModuleManagerData,
    );

    const base = baseRows.map(r => this.toOverlaid(r));
    const results = this.applyOverlay(
      base,
      mmdActions,
      moduleDefinitionSystemId,
    );
    return results[0] ?? null;
  }

  /**
   * Returns overlaid module manager data for multiple definitions in one base
   * query. Returns a Map keyed by moduleDefinitionSystemId for O(1) lookup.
   *
   * Definitions with no module_manager_data row are absent from the map
   * (not an error — custom metadata is optional).
   */
  async fetchByDefinitionSystemIds(
    moduleDefinitionSystemIds: number[],
    fileSystemId: number,
    sessionId: number | null,
  ): Promise<Map<number, OverlaidModuleManagerData>> {
    if (moduleDefinitionSystemIds.length === 0) return new Map();

    const baseRows = await this.loadBaseRows(
      moduleDefinitionSystemIds,
      fileSystemId,
    );
    const base = baseRows.map(r => this.toOverlaid(r));

    const overlaidRows =
      sessionId === null
        ? base
        : await this.applyTableOverlay(
            base,
            sessionId,
            moduleDefinitionSystemIds,
          );

    const result = new Map<number, OverlaidModuleManagerData>();
    for (const row of overlaidRows) {
      result.set(row.moduleDefinitionSystemId, row);
    }
    return result;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async loadBaseRows(
    moduleDefinitionSystemIds: number[],
    fileSystemId: number,
  ): Promise<ModuleManagerDataBase[]> {
    return (await this.manager
      .getRepository(ENTITY_NAMES.ModuleManagerData)
      .createQueryBuilder('mmd')
      .select([
        'mmd.systemId',
        'mmd.moduleDefinitionSystemId',
        'mmd.fileSystemId',
        'mmd.moduleType',
        'mmd.interfaceType',
        'mmd.interfaceVersion',
        'mmd.fileName',
        'mmd.tag',
      ])
      .where('mmd.moduleDefinitionSystemId IN (:...ids)', {
        ids: moduleDefinitionSystemIds,
      })
      .andWhere('mmd.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany()) as unknown as ModuleManagerDataBase[];
  }

  private toOverlaid(r: ModuleManagerDataBase): OverlaidModuleManagerData {
    return {
      systemId: r.systemId,
      moduleDefinitionSystemId: r.moduleDefinitionSystemId,
      fileSystemId: r.fileSystemId,
      moduleType: r.moduleType,
      interfaceType: r.interfaceType,
      interfaceVersion: r.interfaceVersion,
      fileName: r.fileName,
      tag: r.tag,
    };
  }

  private applyOverlay(
    base: OverlaidModuleManagerData[],
    actions: EditActionRow[],
    defSystemId: number,
  ): OverlaidModuleManagerData[] {
    const overlaid = this.overlay
      .applyToCollection(
        base.map(r => ({...r})),
        actions,
      )
      .map(r => r.effective as OverlaidModuleManagerData);

    const baseIds = new Set(base.map(r => r.systemId));
    const created: OverlaidModuleManagerData[] = actions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<OverlaidModuleManagerData>;
        return {
          systemId: a.targetSystemId,
          moduleDefinitionSystemId: p.moduleDefinitionSystemId ?? defSystemId,
          fileSystemId: p.fileSystemId ?? 0,
          moduleType: p.moduleType ?? (0 as ModuleTypeValue),
          interfaceType: p.interfaceType ?? (0 as InterfaceTypeValue),
          interfaceVersion: p.interfaceVersion ?? (0 as InterfaceVersionValue),
          fileName: p.fileName ?? '',
          tag: p.tag ?? '',
        };
      });

    return [...overlaid, ...created];
  }

  private async applyTableOverlay(
    base: OverlaidModuleManagerData[],
    sessionId: number,
    defSystemIds: number[],
  ): Promise<OverlaidModuleManagerData[]> {
    const allActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.ModuleManagerData,
    );
    const defIdSet = new Set(defSystemIds);
    const relevantActions = allActions.filter(a => defIdSet.has(a.aggregateId));
    return this.applyOverlay(base, relevantActions, 0);
  }
}
