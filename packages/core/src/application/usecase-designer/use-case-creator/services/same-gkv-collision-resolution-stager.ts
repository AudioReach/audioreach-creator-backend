/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {SOURCE, CHANGE_OPERATION} from '../../../shared/change-vocabulary.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {
  ReferencedComponents,
  UsecaseChangeRef,
} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';
import {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {AutoRoutingInput} from '../contracts/routing-input.js';
import {
  COLLISION_OPERAND_KIND,
  COLLISION_RESOLUTION_MODE,
  type CollisionResolutionMode,
  type SameGkvCollision,
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
  const seen = new Set<string>();
  const result: Pair[] = [];
  for (const pair of pairs) {
    const key = directedKey(pair);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(pair);
  }
  return result.sort(
    (left, right) =>
      left.sourceSubgraphSystemId - right.sourceSubgraphSystemId ||
      left.destSubgraphSystemId - right.destSubgraphSystemId,
  );
}

function candidateOperand(
  collision: SameGkvCollision,
  mode: CollisionResolutionMode,
): RoutingCombination {
  if (mode === COLLISION_RESOLUTION_MODE.PathB) {
    const operand = collision.operands[1];
    if (operand.kind === COLLISION_OPERAND_KIND.New) return operand.candidate;
  }
  const operand = collision.operands[0];
  if (operand.kind === COLLISION_OPERAND_KIND.New) return operand.candidate;
  throw new Error(`Collision ${collision.collisionId} has no new candidate`);
}

function existingOperand(
  collision: SameGkvCollision,
): Extract<
  (typeof collision.operands)[number],
  {readonly kind: typeof COLLISION_OPERAND_KIND.Existing}
> | null {
  const operand = collision.operands.find(
    current => current.kind === COLLISION_OPERAND_KIND.Existing,
  );
  return operand?.kind === COLLISION_OPERAND_KIND.Existing ? operand : null;
}

function newCandidates(collision: SameGkvCollision): RoutingCombination[] {
  return collision.operands
    .filter(
      (
        operand,
      ): operand is Extract<
        (typeof collision.operands)[number],
        {readonly kind: typeof COLLISION_OPERAND_KIND.New}
      > => operand.kind === COLLISION_OPERAND_KIND.New,
    )
    .map(operand => operand.candidate);
}

function mergedCombination(collision: SameGkvCollision): RoutingCombination {
  const candidates = newCandidates(collision);
  const first = candidates[0];
  if (!first)
    throw new Error(`Collision ${collision.collisionId} has no candidate`);
  const ids = [
    ...new Set(
      candidates.flatMap(candidate => candidate.path.subgraphSystemIds),
    ),
  ].sort((left, right) => left - right);
  const sgkvAssignment = new Map(first.sgkvAssignment);
  for (const candidate of candidates.slice(1)) {
    for (const subgraphSystemId of candidate.path.subgraphSystemIds) {
      if (sgkvAssignment.has(subgraphSystemId)) continue;
      sgkvAssignment.set(
        subgraphSystemId,
        candidate.sgkvAssignment.get(subgraphSystemId) ?? {keyValues: []},
      );
    }
  }
  return {
    path: {
      subgraphSystemIds: ids,
      termination: first.path.termination,
      ecBoundaryLinkId: first.path.ecBoundaryLinkId,
    },
    sgkvAssignment,
    gkv: first.gkv,
  };
}

function asUseCase(
  candidate: RoutingCombination,
  fileSystemId: number,
  systemId: number,
  input: AutoRoutingInput,
  pairs = candidatePairs(candidate),
): UseCase {
  return new UseCase({
    systemId,
    fileSystemId,
    keyVector: {
      valueSystemIds: candidate.gkv.map(pair => pair.valueDefSystemId),
    },
    subgraphSystemIds: [...candidate.path.subgraphSystemIds],
    subgraphPairs: pairs,
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
    sgSystemIds: [...new Set(subgraphSystemIds)].sort((a, b) => a - b),
    dataLinkSystemIds: input.graphSnapshot.overlayDataLinks
      .filter(link =>
        directedPairs.has(
          `${link.sourceSubgraphSystemId}>${link.destSubgraphSystemId}`,
        ),
      )
      .map(link => link.systemId)
      .sort((a, b) => a - b),
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
      .sort((a, b) => a - b),
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
    collision: SameGkvCollision,
    mode: CollisionResolutionMode,
    input: AutoRoutingInput,
    uow: UnitOfWork,
    idGeneration: IdGenerationPort,
  ): Promise<UsecaseChangeDescriptor[]> {
    if (mode === COLLISION_RESOLUTION_MODE.KeepExisting) return [];
    const fileSystemId = input.fileSystemId;
    const repository = uow.getUsecaseRepository();
    const options = {source: SOURCE.Manual} as const;
    const existing = existingOperand(collision)?.usecase ?? null;
    const isExistingCollision = existing !== null;
    const selectedCandidate =
      mode === COLLISION_RESOLUTION_MODE.Merge && !isExistingCollision
        ? mergedCombination(collision)
        : candidateOperand(collision, mode);
    const contributingCandidates =
      mode === COLLISION_RESOLUTION_MODE.Merge && !isExistingCollision
        ? newCandidates(collision)
        : [selectedCandidate];
    for (const candidate of contributingCandidates) {
      assertSgkvAssignmentsMatchGkv(candidate, collision.gkvValueSystemIds);
    }
    const sgkvAdditions = collectUsecaseSgkvAdditions(contributingCandidates);
    const selectedPairs =
      mode === COLLISION_RESOLUTION_MODE.Merge && !isExistingCollision
        ? uniquePairs(
            collision.operands
              .filter(
                (
                  operand,
                ): operand is Extract<
                  (typeof collision.operands)[number],
                  {readonly kind: typeof COLLISION_OPERAND_KIND.New}
                > => operand.kind === COLLISION_OPERAND_KIND.New,
              )
              .flatMap(operand => candidatePairs(operand.candidate)),
          )
        : candidatePairs(selectedCandidate);
    const references = componentReferences(
      input,
      selectedCandidate.path.subgraphSystemIds,
      selectedPairs,
    );

    if (isExistingCollision && mode === COLLISION_RESOLUTION_MODE.Merge) {
      const existingSgIds = new Set(existing.subgraphSystemIds);
      const existingPairKeys = new Set(
        existing.subgraphPairs.map(pair => directedKey(pair)),
      );
      const delta = {
        addedSgSystemIds: selectedCandidate.path.subgraphSystemIds.filter(
          systemId => !existingSgIds.has(systemId),
        ),
        addedPairs: selectedPairs.filter(
          pair => !existingPairKeys.has(directedKey(pair)),
        ),
        newType: computeUsecaseType(
          uniquePairs([...existing.subgraphPairs, ...selectedPairs]),
          input.graphSnapshot.routableDataLinks,
        ),
      };
      const ref = await repository.applyStructuralChange(
        existing.systemId,
        delta,
        options,
        references,
        sgkvAdditions,
      );
      return [descriptor(ref, CHANGE_OPERATION.Update)].filter(
        (item): item is UsecaseChangeDescriptor => item !== null,
      );
    }

    const changes: UsecaseChangeDescriptor[] = [];
    if (
      isExistingCollision &&
      mode === COLLISION_RESOLUTION_MODE.ReplaceWithNew
    ) {
      const deleted = await repository.delete(existing.systemId, options);
      const deleteDescriptor = descriptor(deleted, CHANGE_OPERATION.Delete);
      if (deleteDescriptor) changes.push(deleteDescriptor);
    }
    const systemId = await idGeneration.getNextId(fileSystemId);
    const created = await repository.create(
      asUseCase(
        selectedCandidate,
        fileSystemId,
        systemId,
        input,
        selectedPairs,
      ),
      options,
      references,
      sgkvAdditions,
    );
    const createDescriptor = descriptor(created, CHANGE_OPERATION.Create);
    if (createDescriptor) changes.push(createDescriptor);
    return changes;
  }
}
