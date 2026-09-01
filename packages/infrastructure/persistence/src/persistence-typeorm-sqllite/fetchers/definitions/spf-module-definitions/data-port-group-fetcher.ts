/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import type {DataPortGroupBase} from '../../../entity-schema/definitions/module/spf/data-group-definition.schema.js';
import type {DataPortDefinitionBase} from '../../../entity-schema/definitions/module/spf/data-port-definition.schema.js';

export interface OverlaidDataPortGroup extends DataPortGroupBase {
  portDefinitions: DataPortDefinitionBase[];
}

export class DataPortGroupFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsSvc: EditActionsQueryService,
  ) {}

  async fetchMany(
    defSystemId: number,
    sessionId: number | null,
  ): Promise<OverlaidDataPortGroup[]> {
    const baseGroupRows = (await this.manager
      .getRepository(ENTITY_NAMES.DataPortGroup)
      .createQueryBuilder('dpg')
      .where('dpg.moduleDefinitionSystemId = :defSystemId', {defSystemId})
      .getMany()) as unknown as DataPortGroupBase[];

    if (baseGroupRows.length === 0 && sessionId === null) return [];

    const baseGroups: OverlaidDataPortGroup[] = baseGroupRows.map(r => ({
      ...r,
      portDefinitions: [],
    }));

    // Load port definitions for base groups
    let basePortDefRows: DataPortDefinitionBase[] = [];
    if (baseGroupRows.length > 0) {
      const groupIds = baseGroupRows.map(g => g.systemId);
      basePortDefRows = (await this.manager
        .getRepository(ENTITY_NAMES.DataPortDefinition)
        .createQueryBuilder('dpd')
        .where('dpd.dataPortGroupSystemId IN (:...groupIds)', {groupIds})
        .getMany()) as unknown as DataPortDefinitionBase[];
    }

    if (sessionId === null) {
      return this.buildResult(baseGroups, basePortDefRows);
    }

    const actions = await this.editActionsSvc.getByAggregateId(
      sessionId,
      defSystemId,
    );
    const groupActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.DataPortGroup,
    );
    const portDefActions = actions.filter(
      a => a.targetTable === ENTITY_NAMES.DataPortDefinition,
    );

    // Overlay groups
    const allGroups = this.overlay
      .applyToCollection(
        baseGroups.map(g => ({...g})),
        groupActions,
      )
      .map(r => r.effective as OverlaidDataPortGroup);

    // Overlay port definitions
    const allPorts = this.overlay
      .applyToCollection(
        basePortDefRows.map(p => ({...p})),
        portDefActions,
      )
      .map(r => r.effective as DataPortDefinitionBase);

    return this.buildResult(allGroups, allPorts);
  }

  private buildResult(
    groups: OverlaidDataPortGroup[],
    allPorts: DataPortDefinitionBase[],
  ): OverlaidDataPortGroup[] {
    const portsByGroup = new Map<number, DataPortDefinitionBase[]>();
    for (const port of allPorts) {
      const existing = portsByGroup.get(port.dataPortGroupSystemId) ?? [];
      existing.push(port);
      portsByGroup.set(port.dataPortGroupSystemId, existing);
    }
    return groups.map(g => ({
      ...g,
      portDefinitions: portsByGroup.get(g.systemId) ?? [],
    }));
  }
}
