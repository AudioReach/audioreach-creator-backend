/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, SOURCE} from '../../../shared/change-vocabulary.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {
  ReferencedComponents,
  UsecaseChangeRef,
} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';
import type {KvPair} from '../../../ports/persistence/repositories/shared/kv-pair.js';
import type {SubgraphPair} from '../../../ports/persistence/repositories/shared/links-for-pair.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {AutoRoutingInput} from '../contracts/routing-input.js';
import {
  COLLISION_ALTERNATIVE_KIND,
  COLLISION_RESOLUTION_MODE,
  type CollisionResolutionSelection,
  type ExistingCollisionAlternative,
  type NewCollisionAlternative,
  type SameGkvCollisionGroup,
} from '../contracts/same-gkv-collision.js';
import type {
  RoutedUsecaseCandidate,
  UsecaseChangeDescriptor,
} from '../contracts/routing-state.js';
import {USECASE_CANDIDATE_KIND} from '../contracts/routing-state.js';
import {
  assertSgkvAssignmentsMatchGkv,
  collectUsecaseSgkvAdditions,
} from '../shared/routing-sgkv-assignments.js';
import {
  computeUsecaseType,
  hasDirectedDataLinkSupport,
} from '../shared/usecase-type-classifier.js';
import {
  candidatePairs,
  directedPairKey,
  directedPairKeyOf,
  unorderedPairKeyOf,
} from '../shared/usecase-topology.js';

type AssignmentsBySubgraph = Map<number, Map<number, KvPair>>;

/**
 * Collapses duplicates across merged alternatives. A data-supported pair keeps
 * its direction. A pair with no data support is a control-link pair, whose
 * direction carries no domain semantics, so the same unordered relationship is
 * recorded once.
 */
function uniquePairs(
  pairs: readonly SubgraphPair[],
  routableDataLinks: readonly DataLink[],
): SubgraphPair[] {
  const byDirectedKey = new Map<string, SubgraphPair>();
  for (const pair of pairs) byDirectedKey.set(directedPairKeyOf(pair), pair);
  const ordered = [...byDirectedKey.values()].sort(
    (left, right) =>
      left.sourceSubgraphSystemId - right.sourceSubgraphSystemId ||
      left.destSubgraphSystemId - right.destSubgraphSystemId,
  );
  const kept: SubgraphPair[] = [];
  const takenUnorderedKeys = new Set<string>();
  for (const pair of ordered) {
    if (!hasDirectedDataLinkSupport(pair, routableDataLinks)) continue;
    kept.push(pair);
    takenUnorderedKeys.add(unorderedPairKeyOf(pair));
  }
  for (const pair of ordered) {
    if (hasDirectedDataLinkSupport(pair, routableDataLinks)) continue;
    const key = unorderedPairKeyOf(pair);
    if (takenUnorderedKeys.has(key)) continue;
    takenUnorderedKeys.add(key);
    kept.push(pair);
  }
  return kept.sort(
    (left, right) =>
      left.sourceSubgraphSystemId - right.sourceSubgraphSystemId ||
      left.destSubgraphSystemId - right.destSubgraphSystemId,
  );
}

function newAlternatives(
  group: SameGkvCollisionGroup,
): NewCollisionAlternative[] {
  return group.alternatives.filter(
    (alternative): alternative is NewCollisionAlternative =>
      alternative.kind === COLLISION_ALTERNATIVE_KIND.New,
  );
}

function existingAlternative(
  group: SameGkvCollisionGroup,
): ExistingCollisionAlternative | null {
  return (
    group.alternatives.find(
      (alternative): alternative is ExistingCollisionAlternative =>
        alternative.kind === COLLISION_ALTERNATIVE_KIND.Existing,
    ) ?? null
  );
}

function selectedCandidate(
  group: SameGkvCollisionGroup,
  alternativeId: string,
): RoutedUsecaseCandidate {
  const alternative = newAlternatives(group).find(
    candidate => candidate.alternativeId === alternativeId,
  );
  if (!alternative)
    throw new Error(
      `Collision ${group.collisionId} has no candidate ${alternativeId}`,
    );
  return alternative.candidate;
}

function addCandidateToMerge(
  alternative: NewCollisionAlternative,
  group: SameGkvCollisionGroup,
  subgraphSystemIds: Set<number>,
  assignmentBySubgraph: AssignmentsBySubgraph,
  pairs: SubgraphPair[],
): void {
  assertSgkvAssignmentsMatchGkv(alternative.candidate, group.gkvValueSystemIds);
  pairs.push(...candidatePairs(alternative.candidate));
  for (const systemId of alternative.candidate.path.subgraphSystemIds) {
    subgraphSystemIds.add(systemId);
    const byKey =
      assignmentBySubgraph.get(systemId) ?? new Map<number, KvPair>();
    assignmentBySubgraph.set(systemId, byKey);
    for (const pair of alternative.candidate.sgkvAssignment.get(systemId)
      ?.keyValues ?? []) {
      const existing = byKey.get(pair.keyDefSystemId);
      if (existing && existing.valueDefSystemId !== pair.valueDefSystemId) {
        throw new Error(
          `Conflicting SGKV assignments for subgraph ${systemId} and key ${pair.keyDefSystemId}`,
        );
      }
      byKey.set(pair.keyDefSystemId, pair);
    }
  }
}

function addExistingTopology(
  existing: ExistingCollisionAlternative | null,
  subgraphSystemIds: Set<number>,
  pairs: SubgraphPair[],
): void {
  if (existing === null) return;
  for (const systemId of existing.usecase.subgraphSystemIds)
    subgraphSystemIds.add(systemId);
  pairs.push(...existing.usecase.subgraphPairs);
}

function mergeAllCandidates(
  group: SameGkvCollisionGroup,
  routableDataLinks: readonly DataLink[],
): {
  readonly candidate: RoutedUsecaseCandidate;
  readonly pairs: readonly SubgraphPair[];
} {
  const alternatives = newAlternatives(group);
  const first = alternatives[0]?.candidate;
  if (!first)
    throw new Error(`Collision ${group.collisionId} has no new candidate`);

  const subgraphSystemIds = new Set<number>();
  const assignmentBySubgraph: AssignmentsBySubgraph = new Map();
  const pairs: SubgraphPair[] = [];
  for (const alternative of alternatives) {
    addCandidateToMerge(
      alternative,
      group,
      subgraphSystemIds,
      assignmentBySubgraph,
      pairs,
    );
  }

  addExistingTopology(existingAlternative(group), subgraphSystemIds, pairs);

  const path = {
    subgraphSystemIds: [...subgraphSystemIds].sort(
      (left, right) => left - right,
    ),
    termination: first.path.termination,
    ecBoundaryLinkId: first.path.ecBoundaryLinkId,
  };
  const sgkvAssignment = new Map(
    [...subgraphSystemIds]
      .sort((left, right) => left - right)
      .map(systemId => [
        systemId,
        {
          keyValues: [
            ...(assignmentBySubgraph.get(systemId)?.values() ?? []),
          ].sort(
            (left, right) =>
              left.keyDefSystemId - right.keyDefSystemId ||
              left.valueDefSystemId - right.valueDefSystemId,
          ),
        },
      ]),
  );
  const mergedControlLinkPairs = uniquePairs(
    alternatives.flatMap(alternative => [
      ...alternative.candidate.controlLinkPairs,
    ]),
    routableDataLinks,
  ).filter(
    pair =>
      subgraphSystemIds.has(pair.sourceSubgraphSystemId) &&
      subgraphSystemIds.has(pair.destSubgraphSystemId),
  );
  const candidate: RoutedUsecaseCandidate =
    first.kind === USECASE_CANDIDATE_KIND.Auto
      ? {
          kind: USECASE_CANDIDATE_KIND.Auto,
          path,
          sgkvAssignment,
          gkv: first.gkv,
          controlLinkPairs: mergedControlLinkPairs,
        }
      : {
          kind: USECASE_CANDIDATE_KIND.EcBridge,
          representativeDataLinkSystemId: first.representativeDataLinkSystemId,
          dataLinkSystemIds: first.dataLinkSystemIds,
          path,
          sgkvAssignment,
          gkv: first.gkv,
          controlLinkPairs: mergedControlLinkPairs,
        };
  assertSgkvAssignmentsMatchGkv(candidate, group.gkvValueSystemIds);
  return {candidate, pairs: uniquePairs(pairs, routableDataLinks)};
}

function asUseCase(
  candidate: RoutedUsecaseCandidate,
  fileSystemId: number,
  systemId: number,
  input: AutoRoutingInput,
  pairs: readonly SubgraphPair[],
): UseCase {
  return new UseCase({
    systemId,
    fileSystemId,
    keyVector: {
      valueSystemIds: candidate.gkv.map(pair => pair.valueDefSystemId),
    },
    subgraphSystemIds: [...candidate.path.subgraphSystemIds],
    subgraphPairs: [...pairs],
    type: computeUsecaseType(
      candidate.path.subgraphSystemIds,
      pairs,
      input.graphSnapshot.routableDataLinks,
    ),
  });
}

function componentReferences(
  input: AutoRoutingInput,
  subgraphSystemIds: readonly number[],
  pairs: readonly SubgraphPair[],
): ReferencedComponents {
  const directedPairs = new Set(pairs.map(pair => directedPairKeyOf(pair)));
  const unorderedPairs = new Set(pairs.map(pair => unorderedPairKeyOf(pair)));
  return {
    sgSystemIds: [...new Set(subgraphSystemIds)].sort(
      (left, right) => left - right,
    ),
    dataLinkSystemIds: input.graphSnapshot.overlayDataLinks
      .filter(link =>
        directedPairs.has(
          directedPairKey(
            link.sourceSubgraphSystemId,
            link.destSubgraphSystemId,
          ),
        ),
      )
      .map(link => link.systemId)
      .sort((left, right) => left - right),
    controlLinkSystemIds: input.graphSnapshot.overlayControlLinks
      .filter(link =>
        unorderedPairs.has(
          unorderedPairKeyOf({
            sourceSubgraphSystemId: link.peerNodeASystemId,
            destSubgraphSystemId: link.peerNodeBSystemId,
          }),
        ),
      )
      .map(link => link.systemId)
      .sort((left, right) => left - right),
  };
}

function descriptor(
  ref: UsecaseChangeRef | null,
  operation: Exclude<
    (typeof CHANGE_OPERATION)[keyof typeof CHANGE_OPERATION],
    typeof CHANGE_OPERATION.None
  >,
): UsecaseChangeDescriptor | null {
  return ref === null
    ? null
    : {
        systemId: ref.systemId,
        changeId: ref.changeId,
        operation,
        source: SOURCE.Manual,
      };
}

export class SameGkvCollisionResolutionStager {
  async stage(
    group: SameGkvCollisionGroup,
    selection: CollisionResolutionSelection,
    input: AutoRoutingInput,
    uow: UnitOfWork,
    idGeneration: IdGenerationPort,
  ): Promise<UsecaseChangeDescriptor[]> {
    if (selection.mode === COLLISION_RESOLUTION_MODE.KeepExisting) return [];

    const existing = existingAlternative(group)?.usecase ?? null;
    const repository = uow.getUsecaseRepository();
    const options = {source: SOURCE.Manual} as const;
    let candidate: RoutedUsecaseCandidate;
    let selectedPairs: readonly SubgraphPair[];
    if (selection.mode === COLLISION_RESOLUTION_MODE.SelectCandidate) {
      candidate = selectedCandidate(group, selection.alternativeId);
      assertSgkvAssignmentsMatchGkv(candidate, group.gkvValueSystemIds);
      selectedPairs = candidatePairs(candidate);
    } else {
      const merged = mergeAllCandidates(
        group,
        input.graphSnapshot.routableDataLinks,
      );
      candidate = merged.candidate;
      selectedPairs = merged.pairs;
    }

    const sgkvAdditions = collectUsecaseSgkvAdditions([candidate]);
    const references = componentReferences(
      input,
      candidate.path.subgraphSystemIds,
      selectedPairs,
    );

    if (
      existing !== null &&
      selection.mode === COLLISION_RESOLUTION_MODE.MergeAll
    ) {
      const existingSgIds = new Set(existing.subgraphSystemIds);
      const existingPairKeys = new Set(
        existing.subgraphPairs.map(pair => directedPairKeyOf(pair)),
      );
      const existingUnorderedPairKeys = new Set(
        existing.subgraphPairs.map(pair => unorderedPairKeyOf(pair)),
      );
      const addedPairs = selectedPairs.filter(pair => {
        if (existingPairKeys.has(directedPairKeyOf(pair))) return false;
        if (
          !hasDirectedDataLinkSupport(
            pair,
            input.graphSnapshot.routableDataLinks,
          ) &&
          existingUnorderedPairKeys.has(unorderedPairKeyOf(pair))
        )
          return false;
        return true;
      });
      const ref = await repository.applyStructuralChange(
        existing.systemId,
        {
          addedSgSystemIds: candidate.path.subgraphSystemIds.filter(
            systemId => !existingSgIds.has(systemId),
          ),
          addedPairs,
          newType: computeUsecaseType(
            [
              ...existing.subgraphSystemIds,
              ...candidate.path.subgraphSystemIds.filter(
                systemId => !existingSgIds.has(systemId),
              ),
            ],
            selectedPairs,
            input.graphSnapshot.routableDataLinks,
          ),
        },
        options,
        references,
        sgkvAdditions,
      );
      return [descriptor(ref, CHANGE_OPERATION.Update)].filter(
        (item): item is UsecaseChangeDescriptor => item !== null,
      );
    }

    const changes: UsecaseChangeDescriptor[] = [];
    if (existing !== null) {
      const deleted = await repository.delete(existing.systemId, options);
      const deleteDescriptor = descriptor(deleted, CHANGE_OPERATION.Delete);
      if (deleteDescriptor) changes.push(deleteDescriptor);
    }
    const systemId = await idGeneration.getNextId(input.fileSystemId);
    const created = await repository.create(
      asUseCase(candidate, input.fileSystemId, systemId, input, selectedPairs),
      options,
      references,
      sgkvAdditions,
    );
    const createDescriptor = descriptor(created, CHANGE_OPERATION.Create);
    if (createDescriptor) changes.push(createDescriptor);
    return changes;
  }
}
