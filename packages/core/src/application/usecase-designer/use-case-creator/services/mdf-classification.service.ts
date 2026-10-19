/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  IPC_RX_MODULE_DEF_ID,
  IPC_TX_MODULE_DEF_ID,
} from '../../../../domain/entities/definitions/spf-module/ipc-module-def-ids.js';
import type {Subgraph} from '../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import {READ_MODE} from '../../../ports/persistence/repositories/shared/read-options.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';

/**
 * Identifies MDF subgraphs from their effective modules and module definitions.
 * A qualifying subgraph has exactly IPC TX and IPC RX.
 */
/**
 * Identifies MDF subgraphs from their effective module definitions.
 *
 * Used by `RoutingGraphSnapshotBuilder`.
 */
export class MdfClassificationService {
  /**
   * Classifies two subgraph groups in parallel repository reads.
   * Effective SGs are read from the session overlay (their modules are live);
   * deleted SGs are read from committed state (their IPC modules may already
   * be hidden in the overlay). Both reads share one subsequent definition lookup.
   *
   * Missing committed evidence means "not proven MDF" — reverse normalization
   * does not apply and ordinary deletion handling wins.
   */
  async classifyMdfSubgraphs(
    effectiveSgs: readonly Subgraph[],
    deletedSgs: readonly Subgraph[],
    fileSystemId: number,
    uow: UnitOfWork,
  ): Promise<{
    readonly effectiveMdfIds: ReadonlySet<number>;
    readonly deletedMdfIds: ReadonlySet<number>;
  }> {
    if (effectiveSgs.length === 0 && deletedSgs.length === 0)
      return {effectiveMdfIds: new Set(), deletedMdfIds: new Set()};

    const moduleRepo = uow.getModuleRepository();
    const effectiveIds = effectiveSgs.map(subgraph => subgraph.systemId);
    const deletedIds = deletedSgs.map(subgraph => subgraph.systemId);
    const [effectiveModules, deletedModules] = await Promise.all([
      effectiveIds.length > 0
        ? moduleRepo.findModulesBySubgraphIds(effectiveIds, fileSystemId)
        : Promise.resolve([]),
      deletedIds.length > 0
        ? moduleRepo.findModulesBySubgraphIds(deletedIds, fileSystemId, {
            readMode: READ_MODE.Committed,
          })
        : Promise.resolve([]),
    ]);
    const allModules = [...effectiveModules, ...deletedModules];
    const definitionSystemIds = [
      ...new Set(allModules.map(module => module.definitionSystemId)),
    ];
    const definitions =
      definitionSystemIds.length > 0
        ? await uow
            .getModuleDefinitionRepository()
            .findBySystemIds(definitionSystemIds, fileSystemId)
        : [];
    const naturalIdByDefinitionSystemId = new Map(
      definitions.map(definition => [
        definition.systemId,
        definition.naturalId,
      ]),
    );

    const indexModulesBySubgraphSystemId = (modules: typeof allModules) => {
      const index = new Map<number, typeof modules>();
      for (const module of modules) {
        const group = index.get(module.subgraphSystemId) ?? [];
        group.push(module);
        index.set(module.subgraphSystemId, group);
      }
      return index;
    };
    const isMdfSubgraph = (
      subgraphSystemId: number,
      moduleIndex: Map<number, typeof allModules>,
    ): boolean => {
      const subgraphModules = moduleIndex.get(subgraphSystemId) ?? [];
      if (subgraphModules.length !== 2) return false;
      const naturalIds = new Set(
        subgraphModules.map(module =>
          naturalIdByDefinitionSystemId.get(module.definitionSystemId),
        ),
      );
      return (
        naturalIds.has(IPC_TX_MODULE_DEF_ID) &&
        naturalIds.has(IPC_RX_MODULE_DEF_ID)
      );
    };

    const effectiveIndex = indexModulesBySubgraphSystemId(effectiveModules);
    const deletedIndex = indexModulesBySubgraphSystemId(deletedModules);
    const effectiveMdfIds = new Set<number>();
    for (const subgraph of effectiveSgs)
      if (isMdfSubgraph(subgraph.systemId, effectiveIndex))
        effectiveMdfIds.add(subgraph.systemId);

    const deletedMdfIds = new Set<number>();
    for (const subgraph of deletedSgs)
      if (isMdfSubgraph(subgraph.systemId, deletedIndex))
        deletedMdfIds.add(subgraph.systemId);

    return {effectiveMdfIds, deletedMdfIds};
  }
}
