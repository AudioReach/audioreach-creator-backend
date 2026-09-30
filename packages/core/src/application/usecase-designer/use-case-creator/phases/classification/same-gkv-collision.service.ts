/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {v5 as uuidV5} from 'uuid';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {ActiveManualUsecaseEdit} from '../../../../ports/persistence/repositories/usecase/usecase.repository.js';
import {
  COLLISION_ALTERNATIVE_KIND,
  type SameGkvCollisionAlternative,
  type SameGkvCollisionGroup,
} from '../../contracts/same-gkv-collision.js';
import type {RoutingCombination} from '../../contracts/routing-state.js';
import {
  candidateDirectedAdjacentPairs,
  canonicalNumericSetKey,
  directedPairKey,
} from '../../shared/usecase-topology.js';

export const SAME_GKV_COLLISION_UUID_NAMESPACE =
  '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

interface CollisionTopology {
  readonly subgraphSystemIds: readonly number[];
  readonly pairKeys: readonly string[];
}

export interface SameGkvBucket {
  readonly gkvValueSystemIds: readonly number[];
  readonly candidates: readonly RoutingCombination[];
  readonly existingUsecase: UseCase | null;
  readonly manualOverrides: readonly ActiveManualUsecaseEdit[];
}

function sortedUnique(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((left, right) => left - right);
}

function sortedPairKeys(keys: readonly string[]): string[] {
  return [...new Set(keys)].sort((left, right) => left.localeCompare(right));
}

function candidateTopology(candidate: RoutingCombination): CollisionTopology {
  return {
    subgraphSystemIds: candidate.path.subgraphSystemIds,
    pairKeys: candidateDirectedAdjacentPairs(candidate).map(pair =>
      directedPairKey(pair.sourceSubgraphSystemId, pair.destSubgraphSystemId),
    ),
  };
}

function usecaseTopology(usecase: UseCase): CollisionTopology {
  return {
    subgraphSystemIds: usecase.subgraphSystemIds,
    pairKeys: usecase.subgraphPairs.map(pair =>
      directedPairKey(pair.sourceSubgraphSystemId, pair.destSubgraphSystemId),
    ),
  };
}

function topologyKey(topology: CollisionTopology): string {
  return [
    canonicalNumericSetKey(topology.subgraphSystemIds),
    sortedPairKeys(topology.pairKeys).join(','),
  ].join(':');
}

function usecaseGkvKey(usecase: UseCase): string {
  return canonicalNumericSetKey(usecase.keyVector.valueSystemIds);
}

function alternativeName(
  kind: (typeof COLLISION_ALTERNATIVE_KIND)[keyof typeof COLLISION_ALTERNATIVE_KIND],
  topology: CollisionTopology,
  systemId?: number,
): string {
  return [
    kind,
    ...(systemId === undefined ? [] : [systemId]),
    topologyKey(topology),
  ].join(':');
}

function alternativeId(name: string): string {
  return uuidV5(name, SAME_GKV_COLLISION_UUID_NAMESPACE);
}

function candidateAlternative(
  candidate: RoutingCombination,
): SameGkvCollisionAlternative {
  const topology = candidateTopology(candidate);
  return {
    alternativeId: alternativeId(
      alternativeName(COLLISION_ALTERNATIVE_KIND.New, topology),
    ),
    kind: COLLISION_ALTERNATIVE_KIND.New,
    candidate,
  };
}

function existingAlternative(usecase: UseCase): SameGkvCollisionAlternative {
  const topology = usecaseTopology(usecase);
  return {
    alternativeId: alternativeId(
      alternativeName(
        COLLISION_ALTERNATIVE_KIND.Existing,
        topology,
        usecase.systemId,
      ),
    ),
    kind: COLLISION_ALTERNATIVE_KIND.Existing,
    usecase,
  };
}

function sameCandidateTopology(
  candidate: RoutingCombination,
  usecase: UseCase,
): boolean {
  return (
    topologyKey(candidateTopology(candidate)) ===
    topologyKey(usecaseTopology(usecase))
  );
}

export class SameGkvCollisionService {
  buildBuckets(
    candidates: readonly RoutingCombination[],
    projectedUsecases: readonly UseCase[],
    activeManualUsecaseEdits: readonly ActiveManualUsecaseEdit[],
  ): SameGkvBucket[] {
    const buckets = new Map<
      string,
      {
        gkvValueSystemIds: number[];
        candidates: Map<string, RoutingCombination>;
        manualOverrides: Map<string, ActiveManualUsecaseEdit>;
      }
    >();

    const getBucket = (gkvValueSystemIds: readonly number[]) => {
      const key = canonicalNumericSetKey(gkvValueSystemIds);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          gkvValueSystemIds: sortedUnique(gkvValueSystemIds),
          candidates: new Map(),
          manualOverrides: new Map(),
        };
        buckets.set(key, bucket);
      }
      return bucket;
    };

    for (const candidate of candidates) {
      getBucket(
        candidate.gkv.map(pair => pair.valueDefSystemId),
      ).candidates.set(topologyKey(candidateTopology(candidate)), candidate);
    }

    for (const edit of activeManualUsecaseEdits) {
      if (edit.usecase === null) continue;
      getBucket(edit.usecase.keyVector.valueSystemIds).manualOverrides.set(
        `${edit.usecase.systemId}:${topologyKey(usecaseTopology(edit.usecase))}`,
        edit,
      );
    }

    return [...buckets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([gkvKey, bucket]) => ({
        gkvValueSystemIds: bucket.gkvValueSystemIds,
        candidates: [...bucket.candidates.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([, candidate]) => candidate),
        existingUsecase:
          projectedUsecases
            .filter(usecase => usecaseGkvKey(usecase) === gkvKey)
            .sort((left, right) => left.systemId - right.systemId)[0] ?? null,
        manualOverrides: [...bucket.manualOverrides.values()].sort(
          (left, right) => left.changeId - right.changeId,
        ),
      }));
  }

  createGroup(bucket: SameGkvBucket): SameGkvCollisionGroup {
    const alternatives: SameGkvCollisionAlternative[] = [];
    if (bucket.existingUsecase !== null)
      alternatives.push(existingAlternative(bucket.existingUsecase));
    for (const candidate of bucket.candidates) {
      if (
        bucket.existingUsecase !== null &&
        sameCandidateTopology(candidate, bucket.existingUsecase)
      )
        continue;
      alternatives.push(candidateAlternative(candidate));
    }
    alternatives.sort((left, right) =>
      left.alternativeId.localeCompare(right.alternativeId),
    );
    const collisionName = [
      canonicalNumericSetKey(bucket.gkvValueSystemIds),
      ...alternatives.map(item => item.alternativeId),
    ].join('|');
    return {
      collisionId: uuidV5(collisionName, SAME_GKV_COLLISION_UUID_NAMESPACE),
      gkvValueSystemIds: sortedUnique(bucket.gkvValueSystemIds),
      alternatives,
    };
  }

  buildGroups(
    candidates: readonly RoutingCombination[],
    projectedUsecases: readonly UseCase[],
    activeManualUsecaseEdits: readonly ActiveManualUsecaseEdit[],
  ): SameGkvCollisionGroup[] {
    return this.buildBuckets(
      candidates,
      projectedUsecases,
      activeManualUsecaseEdits,
    )
      .map(bucket => this.createGroup(bucket))
      .filter(group => group.alternatives.length > 1);
  }
}
