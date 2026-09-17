/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  IPC_RX_MODULE_DEF_ID,
  IPC_TX_MODULE_DEF_ID,
} from '../../../../domain/entities/definitions/spf-module/ipc-module-def-ids.js';
import type {Subgraph} from '../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';

/**
 * Identifies MDF subgraphs from their effective modules and module definitions.
 * A qualifying subgraph has exactly IPC TX and IPC RX.
 */
export class MdfClassificationService {
  async classify(
    subgraphs: readonly Subgraph[],
    fileSystemId: number,
    uow: UnitOfWork,
  ): Promise<ReadonlySet<number>> {
    if (subgraphs.length === 0) return new Set();
    const effectiveSubgraphIds = subgraphs.map(subgraph => subgraph.systemId);
    const modules = await uow
      .getModuleRepository()
      .findModulesBySubgraphIds(effectiveSubgraphIds, fileSystemId);
    const definitionSystemIds = [
      ...new Set(modules.map(module => module.definitionSystemId)),
    ];
    const definitions = await uow
      .getModuleDefinitionRepository()
      .findBySystemIds(definitionSystemIds, fileSystemId);
    const moduleDefinitionIdsBySystemId = new Map(
      definitions.map(definition => [
        definition.systemId,
        definition.naturalId,
      ]),
    );
    const modulesBySubgraphId = new Map<number, typeof modules>();
    for (const module of modules) {
      const group = modulesBySubgraphId.get(module.subgraphSystemId) ?? [];
      group.push(module);
      modulesBySubgraphId.set(module.subgraphSystemId, group);
    }

    const mdfSubgraphIds = new Set<number>();
    for (const subgraphSystemId of effectiveSubgraphIds) {
      const subgraphModules = modulesBySubgraphId.get(subgraphSystemId) ?? [];
      if (subgraphModules.length !== 2) continue;

      const definitionIds = new Set(
        subgraphModules.map(module =>
          moduleDefinitionIdsBySystemId.get(module.definitionSystemId),
        ),
      );
      if (
        definitionIds.has(IPC_TX_MODULE_DEF_ID) &&
        definitionIds.has(IPC_RX_MODULE_DEF_ID)
      ) {
        mdfSubgraphIds.add(subgraphSystemId);
      }
    }

    return mdfSubgraphIds;
  }
}
