/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {v5 as uuidV5} from 'uuid';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {ActiveManualUsecaseEdit} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';
import {
  COLLISION_OPERAND_KIND,
  COLLISION_RESOLUTION_MODE,
  type CollisionResolutionMode,
  type SameGkvCollision,
} from '../contracts/same-gkv-collision.js';
import type {RoutingCombination} from '../contracts/routing-state.js';
import {
  addedInteriorSubgraphIds,
  candidateDirectedAdjacentPairs,
  canonicalNumericSetKey,
  directedPairKey,
  exactTopologyEquals,
} from '../shared/usecase-topology.js';

export const SAME_GKV_COLLISION_UUID_NAMESPACE =
  '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/** Comparison-only topology; IDs are set-like while pair keys retain direction. */
interface CollisionTopology {
  readonly gkvValueSystemIds: readonly number[];
  readonly subgraphSystemIds: readonly number[];
  readonly pairKeys: readonly string[];
}

function candidateTopology(candidate: RoutingCombination): CollisionTopology {
  return {
    gkvValueSystemIds: candidate.gkv.map(pair => pair.valueDefSystemId),
    subgraphSystemIds: candidate.path.subgraphSystemIds,
    pairKeys: candidateDirectedAdjacentPairs(candidate).map(pair =>
      directedPairKey(pair.sourceSubgraphSystemId, pair.destSubgraphSystemId),
    ),
  };
}

function usecaseTopology(usecase: UseCase): CollisionTopology {
  return {
    gkvValueSystemIds: usecase.keyVector.valueSystemIds,
    subgraphSystemIds: usecase.subgraphSystemIds,
    pairKeys: usecase.subgraphPairs.map(pair =>
      directedPairKey(pair.sourceSubgraphSystemId, pair.destSubgraphSystemId),
    ),
  };
}

function sameTopology(
  left: CollisionTopology,
  right: CollisionTopology,
): boolean {
  return (
    canonicalNumericSetKey(left.gkvValueSystemIds) ===
      canonicalNumericSetKey(right.gkvValueSystemIds) &&
    canonicalNumericSetKey(left.subgraphSystemIds) ===
      canonicalNumericSetKey(right.subgraphSystemIds) &&
    [...new Set(left.pairKeys)].sort((a, b) => a.localeCompare(b)).join(',') ===
      [...new Set(right.pairKeys)].sort((a, b) => a.localeCompare(b)).join(',')
  );
}

function sharesSubgraph(
  left: CollisionTopology,
  right: CollisionTopology,
): boolean {
  const rightIds = new Set(right.subgraphSystemIds);
  return left.subgraphSystemIds.some(systemId => rightIds.has(systemId));
}

function operandKey(operand: SameGkvCollision['operands'][number]): string {
  // GKV is shared by both operands, so provenance and topology distinguish them.
  const topology =
    operand.kind === COLLISION_OPERAND_KIND.New
      ? candidateTopology(operand.candidate)
      : usecaseTopology(operand.usecase);
  return [
    operand.kind,
    canonicalNumericSetKey(topology.subgraphSystemIds),
    [...new Set(topology.pairKeys)]
      .sort((a, b) => a.localeCompare(b))
      .join(','),
  ].join(':');
}

function collisionId(
  gkvValueSystemIds: readonly number[],
  operands: SameGkvCollision['operands'],
): string {
  const name = [
    canonicalNumericSetKey(gkvValueSystemIds),
    // Keep the UUID stable when candidate discovery order changes.
    ...operands
      .map(operand => operandKey(operand))
      .sort((a, b) => a.localeCompare(b)),
  ].join('|');
  return uuidV5(name, SAME_GKV_COLLISION_UUID_NAMESPACE);
}

function optionsFor(
  left: CollisionTopology,
  right: CollisionTopology,
  rightIsExisting: boolean,
): readonly CollisionResolutionMode[] {
  const overlapping = sharesSubgraph(left, right);
  // Existing collisions use persistence-oriented choices. NEW/NEW collisions
  // expose Path A/Path B; merge requires the alternatives to share a subgraph.
  if (rightIsExisting) {
    return overlapping
      ? [
          COLLISION_RESOLUTION_MODE.KeepExisting,
          COLLISION_RESOLUTION_MODE.ReplaceWithNew,
          COLLISION_RESOLUTION_MODE.Merge,
        ]
      : [
          COLLISION_RESOLUTION_MODE.KeepExisting,
          COLLISION_RESOLUTION_MODE.ReplaceWithNew,
        ];
  }
  return overlapping
    ? [
        COLLISION_RESOLUTION_MODE.PathA,
        COLLISION_RESOLUTION_MODE.PathB,
        COLLISION_RESOLUTION_MODE.Merge,
      ]
    : [COLLISION_RESOLUTION_MODE.PathA, COLLISION_RESOLUTION_MODE.PathB];
}

function sameGkv(left: CollisionTopology, right: CollisionTopology): boolean {
  return (
    canonicalNumericSetKey(left.gkvValueSystemIds) ===
    canonicalNumericSetKey(right.gkvValueSystemIds)
  );
}

function unionTopology(
  left: CollisionTopology,
  right: CollisionTopology,
): CollisionTopology {
  return {
    gkvValueSystemIds: left.gkvValueSystemIds,
    subgraphSystemIds: [
      ...new Set([...left.subgraphSystemIds, ...right.subgraphSystemIds]),
    ].sort((a, b) => a - b),
    pairKeys: [...new Set([...left.pairKeys, ...right.pairKeys])].sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}

function materializedTopology(
  collision: SameGkvCollision,
  mode: CollisionResolutionMode,
): CollisionTopology | null {
  const [left, right] = collision.operands;
  const leftTopology =
    left.kind === COLLISION_OPERAND_KIND.New
      ? candidateTopology(left.candidate)
      : usecaseTopology(left.usecase);
  const rightTopology =
    right.kind === COLLISION_OPERAND_KIND.New
      ? candidateTopology(right.candidate)
      : usecaseTopology(right.usecase);
  if (mode === COLLISION_RESOLUTION_MODE.KeepExisting) return null;
  if (
    mode === COLLISION_RESOLUTION_MODE.PathA ||
    mode === COLLISION_RESOLUTION_MODE.ReplaceWithNew
  ) {
    return leftTopology;
  }
  if (mode === COLLISION_RESOLUTION_MODE.PathB) return rightTopology;
  return unionTopology(leftTopology, rightTopology);
}

export class SameGkvCollisionService {
  detect(
    candidate: RoutingCombination,
    competing: RoutingCombination | UseCase,
  ): SameGkvCollision | null {
    const leftTopology = candidateTopology(candidate);
    const rightIsCandidate = 'path' in competing;
    const rightTopology = rightIsCandidate
      ? candidateTopology(competing)
      : usecaseTopology(competing);
    if (!sameGkv(leftTopology, rightTopology)) return null;
    if (sameTopology(leftTopology, rightTopology)) return null;
    // Normal classification handles exact matches and valid interior extensions.
    if (
      !rightIsCandidate &&
      (exactTopologyEquals(candidate, competing) ||
        addedInteriorSubgraphIds(candidate, competing).length > 0)
    ) {
      return null;
    }

    const leftOperand = {
      kind: COLLISION_OPERAND_KIND.New,
      candidate,
    } as const;
    let operands: SameGkvCollision['operands'];
    if ('path' in competing) {
      const rightCandidateOperand = {
        kind: COLLISION_OPERAND_KIND.New,
        candidate: competing,
      } as const;
      // Canonical order gives Path A and Path B stable meanings across replays.
      operands =
        operandKey(leftOperand).localeCompare(
          operandKey(rightCandidateOperand),
        ) <= 0
          ? [leftOperand, rightCandidateOperand]
          : [rightCandidateOperand, leftOperand];
    } else {
      // Existing-collision modes expect the proposed topology to remain first.
      operands = [
        leftOperand,
        {kind: COLLISION_OPERAND_KIND.Existing, usecase: competing},
      ];
    }
    return {
      collisionId: collisionId(leftTopology.gkvValueSystemIds, operands),
      gkvValueSystemIds: [...leftTopology.gkvValueSystemIds].sort(
        (left, right) => left - right,
      ),
      operands,
      options: optionsFor(leftTopology, rightTopology, !rightIsCandidate),
    };
  }

  isResolutionRecognized(
    collision: SameGkvCollision,
    activeManualUsecaseEdits: readonly ActiveManualUsecaseEdit[],
  ): boolean {
    for (const mode of collision.options) {
      const topology = materializedTopology(collision, mode);
      if (topology === null) continue;
      if (
        activeManualUsecaseEdits.some(edit =>
          edit.usecase === null
            ? false
            : sameTopology(topology, usecaseTopology(edit.usecase)),
        )
      ) {
        return true;
      }
    }
    return false;
  }
}
