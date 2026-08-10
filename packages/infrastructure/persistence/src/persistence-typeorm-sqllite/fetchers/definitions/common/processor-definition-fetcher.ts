/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {ProcessorDefinitionBase} from '../../../entity-schema/definitions/common/processor-definition.schema.js';

/**
 * Fetches processor_definitions by system ID with session overlay applied.
 *
 * ProcessorDefinitions are referenced by SpfModuleDefinitions. This fetcher
 * is used when the service needs processor names or IDs for read model assembly
 * and must respect session edits (FR-3).
 *
 * Uses getByTable for overlay so a single edit_actions query covers any number
 * of processor IDs — consistent with the bulk pattern in other fetchers.
 */
export class ProcessorDefinitionFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns overlaid processor definitions for the given system IDs.
   * Scopes baseline query to the provided IDs; overlay covers the session table.
   */
  async fetchBySystemIds(
    processorSystemIds: number[],
    sessionId: number | null,
  ): Promise<ProcessorDefinitionBase[]> {
    if (processorSystemIds.length === 0) return [];

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.ProcessorDefinition)
      .createQueryBuilder('p')
      .whereInIds(processorSystemIds)
      .getMany()) as unknown as ProcessorDefinitionBase[];

    if (sessionId === null) return baseRows;

    // Load all processor edit_actions for the session; filter to requested IDs
    // in memory — one DB call regardless of how many processor IDs are requested.
    const allActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.ProcessorDefinition,
    );
    const idSet = new Set(processorSystemIds);
    const relevantActions = allActions.filter(a => idSet.has(a.aggregateId));

    const overlaid = this.overlay
      .applyToCollection(
        baseRows.map(processDef => ({...processDef})),
        relevantActions,
      )
      .map(r => r.effective as ProcessorDefinitionBase);

    const baseIds = new Set(baseRows.map(r => r.systemId));
    const created: ProcessorDefinitionBase[] = relevantActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<ProcessorDefinitionBase>;
        return {
          systemId: a.targetSystemId,
          processorDefinitionId: p.processorDefinitionId ?? 0,
          name: p.name ?? '',
          fileSystemId: p.fileSystemId ?? 0,
        };
      });

    return [...overlaid, ...created];
  }
}
