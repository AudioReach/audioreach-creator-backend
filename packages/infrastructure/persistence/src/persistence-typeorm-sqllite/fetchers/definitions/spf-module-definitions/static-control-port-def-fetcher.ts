/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {CHANGE_OPERATION} from '@arc/core';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {StaticControlPortDefinitionBase} from '../../../entity-schema/definitions/module/spf/static-control-port-definition.schema.js';

export interface OverlaidStaticControlPortDefinition {
  systemId: number;
  portId: number;
  portName: string;
  moduleDefinitionSystemId: number;
}

export class StaticControlPortDefFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchForDefinition(
    defSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidStaticControlPortDefinition[]> {
    const baseRows = (await this.manager
      .getRepository(ENTITY_NAMES.StaticControlPortDefinition)
      .createQueryBuilder('scpd')
      .select([
        'scpd.systemId',
        'scpd.portId',
        'scpd.portName',
        'scpd.moduleDefinitionSystemId',
      ])
      .where('scpd.moduleDefinitionSystemId = :defSystemId', {defSystemId})
      .getMany()) as unknown as StaticControlPortDefinitionBase[];

    const base: OverlaidStaticControlPortDefinition[] = baseRows.map(r => ({
      systemId: r.systemId,
      portId: r.portId,
      portName: r.portName,
      moduleDefinitionSystemId: r.moduleDefinitionSystemId,
    }));

    if (sessionId === null) return base;

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      defSystemId,
    );
    const scpActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.StaticControlPortDefinition,
    );

    const overlayBase = base.map(r => ({...r}));
    const overlaid = this.overlay
      .applyToCollection(overlayBase, scpActions)
      .map(r => r.effective as OverlaidStaticControlPortDefinition);

    const baseIds = new Set(base.map(r => r.systemId));
    const created: OverlaidStaticControlPortDefinition[] = scpActions
      .filter(
        a =>
          a.operation === CHANGE_OPERATION.Create &&
          !baseIds.has(a.targetSystemId),
      )
      .map(a => {
        const payload =
          a.newValue as Partial<OverlaidStaticControlPortDefinition>;
        return {
          systemId: a.targetSystemId,
          portId: payload.portId ?? 0,
          portName: payload.portName ?? '',
          moduleDefinitionSystemId:
            payload.moduleDefinitionSystemId ?? defSystemId,
        };
      });

    return [...overlaid, ...created];
  }
}
