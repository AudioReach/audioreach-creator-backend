/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';

interface ContainerTypeBase {
  systemId: number;
  name: string;
  value: number;
}

export interface OverlaidContainerType {
  systemId: number;
  name: string;
  value: number;
}

/**
 * Fetches container_types by system ID with session overlay applied.
 *
 * ContainerType has no fileSystemId — it is a system-wide lookup table.
 * Overlay is scoped to the provided system IDs via getByTable + in-memory filter.
 *
 * Used when assembling container type info for definition summary read models (FR-3).
 */
export class ContainerTypeFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  /**
   * Returns overlaid container types for the given system IDs.
   */
  async fetchBySystemIds(
    containerTypeSystemIds: number[],
    sessionId: number | null,
  ): Promise<OverlaidContainerType[]> {
    if (containerTypeSystemIds.length === 0) return [];

    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.ContainerType)
      .createQueryBuilder('ct')
      .select(['ct.systemId', 'ct.name', 'ct.value'])
      .whereInIds(containerTypeSystemIds)
      .getMany()) as unknown as ContainerTypeBase[];

    const base: OverlaidContainerType[] = baseRows.map(r => ({
      systemId: r.systemId,
      name: r.name,
      value: r.value,
    }));

    if (sessionId === null) return base;

    // Single getByTable call covers all requested container type IDs.
    const allActions = await this.editActionsSvc.getByTable(
      sessionId,
      ENTITY_NAMES.ContainerType,
    );
    const idSet = new Set(containerTypeSystemIds);
    const relevantActions = allActions.filter(a => idSet.has(a.aggregateId));

    const overlaid = this.overlay
      .applyToCollection(
        base.map(r => ({...r})),
        relevantActions,
      )
      .map(r => r.effective as OverlaidContainerType);

    const baseIds = new Set(base.map(r => r.systemId));
    const created: OverlaidContainerType[] = relevantActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const p = a.newValue as Partial<OverlaidContainerType>;
        return {
          systemId: a.targetSystemId,
          name: p.name ?? '',
          value: p.value ?? 0,
        };
      });

    return [...overlaid, ...created];
  }
}
