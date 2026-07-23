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

export interface OverlaidDynamicIntentDefinition {
  systemId: number;
  intentId: number;
  name: string;
  maxPort: number;
  moduleDefinitionSystemId: number;
}

export class DynamicIntentDefFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchForDefinition(
    defSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidDynamicIntentDefinition[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.DynamicIntentDefinition)
      .createQueryBuilder('did')
      .select([
        'did.systemId',
        'did.intentId',
        'did.name',
        'did.maxPort',
        'did.moduleDefinitionSystemId',
      ])
      .where('did.moduleDefinitionSystemId = :defSystemId', {defSystemId})
      .getMany()) as unknown as DynamicIntentDefinitionBase[];

    const base: OverlaidDynamicIntentDefinition[] = baseRows.map(r => ({
      systemId: r.systemId,
      intentId: r.intentId,
      name: r.name,
      maxPort: r.maxPort,
      moduleDefinitionSystemId: r.moduleDefinitionSystemId,
    }));

    if (sessionId === null) return base;

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      defSystemId,
    );
    const didActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.DynamicIntentDefinition,
    );

    const overlayBase = base.map(r => ({...r}));
    const overlaid = this.overlay
      .applyToCollection(overlayBase, didActions)
      .map(r => r.effective as OverlaidDynamicIntentDefinition);

    const baseIds = new Set(base.map(r => r.systemId));
    const created: OverlaidDynamicIntentDefinition[] = didActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const payload = a.newValue as Partial<OverlaidDynamicIntentDefinition>;
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
