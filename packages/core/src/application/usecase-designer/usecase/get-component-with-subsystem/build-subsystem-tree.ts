/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SubsystemReadModel} from '../../../ports/persistence/query-services/subsystem/subsystem-read-model.js';
import type {ComponentsReadModel} from '../../../ports/persistence/query-services/usecase/query-models/components-read-model.js';
import type {ComponentsWithSubsystemsReadModel} from '../get-component-with-subsystem/components-with-subsystems-read-model.js';

/**
 * Builds a recursive subsystem tree from flat loaded data.
 *
 * Every level (root and each SubsystemNodeReadModel.children) holds:
 *   modules[]      — modules whose parentId = this level's nodeSystemId
 *                    (or undefined for the top level)
 *   dataLinks[]    — links where both endpoint modules are direct children of this level
 *   controlLinks[] — same
 *   subsystems[]   — child subsystems, each with the same shape recursively
 *
 * Pruning: a subsystem only appears if it has at least one in-scope module
 * at or beneath it (subsystems with no in-scope descendants are omitted).
 *
 * @param flat      — flat ComponentsReadModel from the persistence layer
 * @param subsystems — all subsystems for the file (from SubsystemQueryService.findAll)
 */
export function buildSubsystemTree(
  flat: ComponentsReadModel,
  subsystems: SubsystemReadModel[],
): ComponentsWithSubsystemsReadModel {
  const {modules, dataLinks, controlLinks} = flat;

  // Build lookup maps for in-memory traversal
  const subsystemById = new Map(subsystems.map(s => [s.systemId, s]));
  const childrenOf = new Map<number | undefined, number[]>(); // parentId → child subsystem IDs

  for (const sub of subsystems) {
    const key = sub.parentId;
    const siblings = childrenOf.get(key) ?? [];
    siblings.push(sub.systemId);
    childrenOf.set(key, siblings);
  }

  // Pruning: does this subsystem have at least one in-scope module at or beneath it?
  const hasInScopeDescendant = (
    subsystemId: number,
    visited = new Set<number>(),
  ): boolean => {
    if (visited.has(subsystemId)) return false; // cycle guard
    visited.add(subsystemId);
    if (modules.some(m => m.parentId === subsystemId)) return true;
    return (childrenOf.get(subsystemId) ?? []).some(c =>
      hasInScopeDescendant(c, visited),
    );
  };

  // Build one level of the tree (top level: parentId = undefined)
  const buildLevel = (
    parentId?: number,
    visited = new Set<number>(),
  ): ComponentsWithSubsystemsReadModel => {
    const levelModules = modules.filter(m => m.parentId === parentId);

    // Child subsystems of this level — pruned to those with in-scope descendants
    const directChildIds = (childrenOf.get(parentId) ?? []).filter(id =>
      hasInScopeDescendant(id),
    );

    // levelNodeIds determines which virtual link segments belong to this level.
    // Three categories of node IDs are included:
    //   1. Direct module children — non-boundary segments
    //   2. Direct child subsystem IDs — outside segments
    //   3. Current subsystem's own ID — inside segments
    const levelNodeIds = new Set<number>([
      ...levelModules.map(m => m.systemId),
      ...directChildIds,
      ...(parentId !== undefined ? [parentId] : []),
    ]);

    // Place a virtual segment at this level only when both peerNode endpoints are in levelNodeIds.
    // This correctly routes outside segments to the parent level and inside segments to the SS level.
    const levelDataLinks = dataLinks.filter(
      dl =>
        levelNodeIds.has(dl.sourceNodeSystemId) &&
        levelNodeIds.has(dl.destinationNodeSystemId),
    );

    const levelControlLinks = controlLinks.filter(
      cl =>
        levelNodeIds.has(cl.peerNodeASystemId) &&
        levelNodeIds.has(cl.peerNodeBSystemId),
    );

    const subsystemNodes = directChildIds.flatMap(id => {
      if (visited.has(id)) return []; // skip cycles
      const sub = subsystemById.get(id);
      if (!sub) return []; // skip orphaned IDs
      const nextVisited = new Set(visited);
      nextVisited.add(id);
      return [
        {
          systemId: sub.systemId,
          name: sub.name,
          filteredKeys: sub.filteredKeys,
          children: buildLevel(sub.systemId, nextVisited), // recurse
        },
      ];
    });

    return {
      modules: levelModules,
      dataLinks: levelDataLinks,
      controlLinks: levelControlLinks,
      subsystems: subsystemNodes,
    };
  };

  return buildLevel(); // start from top level (no parent)
}
