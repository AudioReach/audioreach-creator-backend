/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {ENTITY_NAMES} from '../../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../../../queries/edit-session/edit-actions-query-service.js';
import {OverlayMergeImpl} from '../../../queries/edit-session/overlay-merge.js';
import {TOOL_POLICY, type ToolPolicy} from '@arc/core';

export interface ModuleParameterDefinitionBase {
  systemId: number;
  naturalId: number;
  name: string;
  description?: string;
  maxSize: number;
  pidType: string;
  isPersistent: boolean;
  elementsStructure: string;
  isReadOnly: boolean;
  toolPolicies?: ToolPolicy[];
  spfModuleDefinitionSystemId: number;
}

/** Raw shape returned by TypeORM before JSON parsing. */
interface RawModuleParameterDefinitionBase extends Omit<
  ModuleParameterDefinitionBase,
  'toolPolicies'
> {
  toolPolicies?: string;
}

function parseToolPolicies(
  raw: RawModuleParameterDefinitionBase,
): ModuleParameterDefinitionBase {
  let toolPolicies: ToolPolicy[] | undefined;
  if (raw.toolPolicies) {
    try {
      const parsed: unknown = JSON.parse(raw.toolPolicies);
      if (Array.isArray(parsed)) {
        const valid = Object.values(TOOL_POLICY) as string[];
        toolPolicies = (parsed as unknown[]).filter(
          (v): v is ToolPolicy => typeof v === 'string' && valid.includes(v),
        );
      }
    } catch {
      // leave undefined on malformed JSON
    }
  }
  return {...raw, toolPolicies};
}

export class ModuleParameterDefinitionFetcher {
  private readonly overlay = new OverlayMergeImpl();

  constructor(
    private readonly manager: EntityManager,
    private readonly editActionsQs: EditActionsQueryService,
  ) {}

  async fetchParameterDefinitions(
    moduleDefSystemId: number,
    sessionId: number | null,
    paramSystemIds?: number[],
  ): Promise<ModuleParameterDefinitionBase[]> {
    let qb = this.manager
      .getRepository(ENTITY_NAMES.SpfModuleParameterDefinition)
      .createQueryBuilder('pd')
      .where('pd.spfModuleDefinitionSystemId = :moduleDefSystemId', {
        moduleDefSystemId,
      });

    if (paramSystemIds && paramSystemIds.length > 0) {
      qb = qb.andWhere('pd.systemId IN (:...paramSystemIds)', {paramSystemIds});
    }

    const rawRows =
      (await qb.getMany()) as unknown as RawModuleParameterDefinitionBase[];
    const rows = rawRows.map(r => parseToolPolicies(r));

    if (sessionId === null) return rows;

    const actions = await this.editActionsQs.getByAggregateAndTable(
      sessionId,
      moduleDefSystemId,
      ENTITY_NAMES.SpfModuleParameterDefinition,
    );

    return this.overlay
      .applyToCollection<ModuleParameterDefinitionBase>(rows, actions)
      .map(r => r.effective);
  }
}
