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
  RoutingCombination,
  UsecaseChangeDescriptor,
} from '../contracts/routing-state.js';
import {
  assertSgkvAssignmentsMatchGkv,
  collectUsecaseSgkvAdditions,
} from '../shared/routing-sgkv-assignments.js';
import {computeUsecaseType} from '../shared/usecase-type-classifier.js';

interface Pair {
  readonly sourceSubgraphSystemId: number;
  readonly destSubgraphSystemId: number;
}

type AssignmentsBySubgraph = Map<number, Map<number, KvPair>>;

function candidatePairs(candidate: RoutingCombination): Pair[] {
  return candidate.path.subgraphSystemIds.slice(1).map((dest, index) => ({
    sourceSubgraphSystemId: candidate.path.subgraphSystemIds[index],
    destSubgraphSystemId: dest,
  }));
}

function directedKey(pair: Pair): string {
  return `${pair.sourceSubgraphSystemId}>${pair.destSubgraphSystemId}`;
}

function unorderedKey(pair: Pair): string {
  return [pair.sourceSubgraphSystemId, pair.destSubgraphSystemId]
    .sort((left, right) => left - right)
    .join('>');
}

function uniquePairs(pairs: readonly Pair[]): Pair[] {
  const byKey = new Map<string, Pair>();
  for (const pair of pairs) byKey.set(directedKey(pair), pair);
  return [...byKey.values()].sort(
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
): RoutingCombination {
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
  pairs: Pair[],
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
  pairs: Pair[],
): void {
  if (existing === null) return;
  for (const systemId of existing.usecase.subgraphSystemIds)
    subgraphSystemIds.add(systemId);
  pairs.push(...existing.usecase.subgraphPairs);
}

function mergeAllCandidates(group: SameGkvCollisionGroup): {
  readonly candidate: RoutingCombination;
  readonly pairs: readonly Pair[];
} {
  const alternatives = newAlternatives(group);
  const first = alternatives[0]?.candidate;
  if (!first)
    throw new Error(`Collision ${group.collisionId} has no new candidate`);

  const subgraphSystemIds = new Set<number>();
  const assignmentBySubgraph: AssignmentsBySubgraph = new Map();
  const pairs: Pair[] = [];
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

  const candidate: RoutingCombination = {
    path: {
      subgraphSystemIds: [...subgraphSystemIds].sort(
        (left, right) => left - right,
      ),
      termination: first.path.termination,
      ecBoundaryLinkId: first.path.ecBoundaryLinkId,
    },
    sgkvAssignment: new Map(
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
    ),
    gkv: first.gkv,
  };
  assertSgkvAssignmentsMatchGkv(candidate, group.gkvValueSystemIds);
  return {candidate, pairs: uniquePairs(pairs)};
}

function asUseCase(
  candidate: RoutingCombination,
  fileSystemId: number,
  systemId: number,
  input: AutoRoutingInput,
  pairs: readonly Pair[],
): UseCase {
  return new UseCase({
    systemId,
    fileSystemId,
    keyVector: {
      valueSystemIds: candidate.gkv.map(pair => pair.valueDefSystemId),
    },
    subgraphSystemIds: [...candidate.path.subgraphSystemIds],
    subgraphPairs: [...pairs],
    type: computeUsecaseType(pairs, input.graphSnapshot.routableDataLinks),
  });
}

function componentReferences(
  input: AutoRoutingInput,
  subgraphSystemIds: readonly number[],
  pairs: readonly Pair[],
): ReferencedComponents {
  const directedPairs = new Set(pairs.map(pair => directedKey(pair)));
  const unorderedPairs = new Set(pairs.map(pair => unorderedKey(pair)));
  return {
    sgSystemIds: [...new Set(subgraphSystemIds)].sort(
      (left, right) => left - right,
    ),
    dataLinkSystemIds: input.graphSnapshot.overlayDataLinks
      .filter(link =>
        directedPairs.has(
          `${link.sourceSubgraphSystemId}>${link.destSubgraphSystemId}`,
        ),
      )
      .map(link => link.systemId)
      .sort((left, right) => left - right),
    controlLinkSystemIds: input.graphSnapshot.overlayControlLinks
      .filter(link =>
        unorderedPairs.has(
          unorderedKey({
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
    let candidate: RoutingCombination;
    let selectedPairs: readonly Pair[];
    if (selection.mode === COLLISION_RESOLUTION_MODE.SelectCandidate) {
      candidate = selectedCandidate(group, selection.alternativeId);
      assertSgkvAssignmentsMatchGkv(candidate, group.gkvValueSystemIds);
      selectedPairs = candidatePairs(candidate);
    } else {
      const merged = mergeAllCandidates(group);
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
        existing.subgraphPairs.map(pair => directedKey(pair)),
      );
      const ref = await repository.applyStructuralChange(
        existing.systemId,
        {
          addedSgSystemIds: candidate.path.subgraphSystemIds.filter(
            systemId => !existingSgIds.has(systemId),
          ),
          addedPairs: selectedPairs.filter(
            pair => !existingPairKeys.has(directedKey(pair)),
          ),
          newType: computeUsecaseType(
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
