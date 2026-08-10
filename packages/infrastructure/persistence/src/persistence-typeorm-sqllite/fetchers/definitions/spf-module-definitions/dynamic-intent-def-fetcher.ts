/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {DynamicIntentDefinitionBase} from '../../../entity-schema/definitions/module/spf/dynamic-intent-definition.schema.js';

export class DynamicIntentDefFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchDynamicIntentDefinition(
    defSystemId: number,
    sessionId: number | null,
  ): Promise<DynamicIntentDefinitionBase[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.DynamicIntentDefinition)
      .createQueryBuilder('did')
      .where('did.moduleDefinitionSystemId = :defSystemId', {defSystemId})
      .getMany()) as unknown as DynamicIntentDefinitionBase[];

    if (sessionId === null) return baseRows;

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      defSystemId,
    );
    const didActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.DynamicIntentDefinition,
    );

    const overlaid = this.overlay
      .applyToCollection(
        baseRows.map(r => ({...r})),
        didActions,
      )
      .map(r => r.effective as DynamicIntentDefinitionBase);

    const baseIds = new Set(baseRows.map(r => r.systemId));
    const created: DynamicIntentDefinitionBase[] = didActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const payload = a.newValue as Partial<DynamicIntentDefinitionBase>;
        return {
          systemId: a.targetSystemId,
          intentId: payload.intentId ?? 0,
          name: payload.name ?? '',
          maxPort: payload.maxPort ?? 0,
          moduleDefinitionSystemId:
            payload.moduleDefinitionSystemId ?? defSystemId,
        };
      });

    return [...overlaid, ...created];
  }
}
