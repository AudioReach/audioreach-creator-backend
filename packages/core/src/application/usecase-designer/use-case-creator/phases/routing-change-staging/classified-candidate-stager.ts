/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  RESULT_KIND,
  Result,
} from '../../../../../application/shared/result/result.js';
import {CHANGE_OPERATION} from '../../../../shared/change-vocabulary.js';
import type {DataLink} from '../../../../../domain/entities/usecase-data/links/data-link.js';
import {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import {
  USECASE_TYPE,
  type UsecaseType,
} from '../../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import {invariant} from '../../../../../shared/assertions/index.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import type {
  ReferencedComponents,
  UsecaseSgkvAssignment,
} from '../../../../ports/persistence/repositories/usecase/usecase.repository.js';
import {
  ROUTING_MODE,
  type ManualRoutingInput,
  type RoutingInput,
} from '../../contracts/routing-input.js';
import {
  ROUTING_CLASSIFICATION_KIND,
  USECASE_CANDIDATE_KIND,
  type ClassifiedUsecase,
  type RoutedUsecaseCandidate,
  type UsecaseChangeDescriptor,
} from '../../contracts/routing-state.js';
import {RoutingIssueFactory} from '../../issues/routing-issue-factory.js';
import {collectUsecaseSgkvAdditions} from '../../shared/routing-sgkv-assignments.js';
import {
  computeManualUsecaseType,
  computeUsecaseType,
  hasDirectedDataLinkSupport,
} from '../../shared/usecase-type-classifier.js';
import type {StagingState} from './topology-change-stager.js';
import type {SubgraphPair} from '../../../../ports/persistence/repositories/shared/links-for-pair.js';
import {
  candidateDataLinkPairs,
  candidatePairs,
  candidateSubgraphSystemIds,
  directedPairKeyOf,
  unorderedPairKeyOf,
} from '../../shared/usecase-topology.js';

export interface ClassifiedCandidateStagerInput {
  readonly classifications: readonly ClassifiedUsecase[];
  readonly staging: StagingState;
  readonly input: RoutingInput;
  readonly idGenerator: IdGenerationPort;
}

interface StructuralChangeDelta {
  readonly addedSgSystemIds?: readonly number[];
  readonly removedSgSystemIds?: readonly number[];
  readonly addedPairs?: readonly SubgraphPair[];
  readonly removedPairs?: readonly SubgraphPair[];
  readonly newType?: UsecaseType;
  readonly cancelPendingDelete?: boolean;
}

/**
 * Bridge intent is authoritative for type. Complete MDF-transparent Bridge topology is
 * still one logical EC crossing and must remain EC regardless of generic pair support.
 */
function automaticUsecaseType(
  candidate: RoutedUsecaseCandidate,
  memberSubgraphSystemIds: readonly number[],
  dataLinkPairs: readonly SubgraphPair[],
  routableDataLinks: readonly DataLink[],
): UsecaseType {
  return candidate.kind === USECASE_CANDIDATE_KIND.EcBridge
    ? USECASE_TYPE.Ec
    : computeUsecaseType(
        memberSubgraphSystemIds,
        dataLinkPairs,
        routableDataLinks,
      );
}

/**
 * Computes which pairs to add and which to remove when extending an existing
 * UseCase with a new candidate's pair set.
 *
 * Two types of pair live in UseCase.subgraphPairs and must be diffed differently:
 *
 * - Data-link pairs are directional: routing flows from source to dest, so
 *   A → B and B → A are distinct edges. These are compared by their exact
 *   directed key.
 *
 * - Control-link pairs are direction-neutral: they record a relationship
 *   between two subgraphs, not a route, so canonical ordering is arbitrary.
 *   The same relationship may be stored as A → B in one UseCase and as B → A
 *   in another. A pair with no committed data-link support in its stored
 *   direction is treated as direction-neutral and compared by unordered
 *   endpoints, preventing a canonical re-ordering from adding a duplicate or
 *   spuriously removing the reverse-stored original.
 *
 *   Committed data links (not the session overlay) are the correct reference:
 *   the direction of a stored pair was fixed at creation time by the data link
 *   that backed it. That fact does not change if the data link is deleted in
 *   the current session.
 */
function reconcilePairs(
  incoming: readonly SubgraphPair[],
  current: readonly SubgraphPair[],
  committedDataLinks: readonly DataLink[],
): {
  readonly addedPairs: SubgraphPair[];
  readonly removedPairs: SubgraphPair[];
} {
  const isDirectionNeutral = (pair: SubgraphPair): boolean =>
    !hasDirectedDataLinkSupport(pair, committedDataLinks);

  const currentDirectedKeys = new Set(
    current.map(pair => directedPairKeyOf(pair)),
  );
  const currentUnorderedKeys = new Set(
    current.map(pair => unorderedPairKeyOf(pair)),
  );
  const incomingDirectedKeys = new Set(
    incoming.map(pair => directedPairKeyOf(pair)),
  );
  const incomingUnorderedKeys = new Set(
    incoming.map(pair => unorderedPairKeyOf(pair)),
  );

  const addedPairs = incoming.filter(pair => {
    if (currentDirectedKeys.has(directedPairKeyOf(pair))) return false;
    if (
      isDirectionNeutral(pair) &&
      currentUnorderedKeys.has(unorderedPairKeyOf(pair))
    )
      return false;
    return true;
  });

  const removedPairs = current.filter(pair => {
    if (incomingDirectedKeys.has(directedPairKeyOf(pair))) return false;
    if (
      isDirectionNeutral(pair) &&
      incomingUnorderedKeys.has(unorderedPairKeyOf(pair))
    )
      return false;
    return true;
  });

  return {addedPairs, removedPairs};
}

/** Applies exact-match, extension, and create classifications in input order. */
export class ClassifiedCandidateStager {
  async stage(input: ClassifiedCandidateStagerInput): Promise<Result<void>> {
    const {classifications, staging, idGenerator} = input;
    if (input.input.mode === ROUTING_MODE.Manual) {
      return this.stageManual(
        classifications,
        staging,
        input.input,
        idGenerator,
      );
    }

    const {fileSystemId, graphSnapshot} = input.input;
    for (const classification of classifications) {
      if (classification.kind === ROUTING_CLASSIFICATION_KIND.ExactMatch)
        continue;
      if (
        classification.kind === ROUTING_CLASSIFICATION_KIND.InteriorExtension
      ) {
        const currentIds = new Set(
          classification.existingUsecase.subgraphSystemIds,
        );
        const {addedPairs, removedPairs} = reconcilePairs(
          candidatePairs(classification.candidate),
          classification.existingUsecase.subgraphPairs,
          graphSnapshot.committedDataLinks,
        );
        const result = await this.applyStructuralChange(
          staging,
          classification.existingUsecase,
          {
            addedSgSystemIds: candidateSubgraphSystemIds(
              classification.candidate,
            ).filter(systemId => !currentIds.has(systemId)),
            addedPairs,
            ...(removedPairs.length === 0 ? {} : {removedPairs}),
            cancelPendingDelete: classification.cancelPendingDelete,
          },
          CHANGE_OPERATION.Update,
          collectUsecaseSgkvAdditions([classification.candidate]),
        );
        if (result.kind === RESULT_KIND.Fail) return result;
        continue;
      }

      const systemId = await idGenerator.getNextId(fileSystemId);
      const candidate = classification.candidate;
      invariant(
        candidate.kind !== USECASE_CANDIDATE_KIND.Manual,
        'Automatic routing cannot stage a manual UseCase candidate',
      );
      const memberSubgraphSystemIds = candidateSubgraphSystemIds(candidate);
      const pairsToPersist = candidatePairs(candidate);
      const dataLinkPairs = candidateDataLinkPairs(candidate);
      const pairResult = this.validatePairs(
        memberSubgraphSystemIds,
        pairsToPersist,
      );
      if (pairResult.kind === RESULT_KIND.Fail) return pairResult;
      const ref = await staging.repository.create(
        new UseCase({
          systemId,
          fileSystemId,
          keyVector: {
            valueSystemIds: candidate.gkv.map(pair => pair.valueDefSystemId),
          },
          subgraphSystemIds: [...memberSubgraphSystemIds],
          subgraphPairs: [...pairsToPersist],
          type: automaticUsecaseType(
            candidate,
            memberSubgraphSystemIds,
            dataLinkPairs,
            graphSnapshot.routableDataLinks,
          ),
        }),
        staging.options,
        undefined,
        collectUsecaseSgkvAdditions([candidate]),
      );
      this.recordChange(staging, ref, CHANGE_OPERATION.Create);
    }
    return Result.ok();
  }

  private async stageManual(
    classifications: readonly ClassifiedUsecase[],
    staging: StagingState,
    input: ManualRoutingInput,
    idGenerator: IdGenerationPort,
  ): Promise<Result<void>> {
    invariant(
      classifications.every(
        classification =>
          classification.kind !== ROUTING_CLASSIFICATION_KIND.InteriorExtension,
      ),
      'Manual routing cannot stage an interior extension classification',
    );

    const creates = classifications.filter(
      classification =>
        classification.kind === ROUTING_CLASSIFICATION_KIND.Create,
    );
    if (creates.length === 0) return Result.ok();

    for (const classification of creates) {
      const candidate = classification.candidate;
      invariant(
        candidate.kind === USECASE_CANDIDATE_KIND.Manual,
        'Manual routing cannot stage an automatic UseCase candidate',
      );
      const memberSgSystemIds = candidate.memberSubgraphSystemIds;
      const pairsToPersist = candidatePairs(candidate);
      const pairResult = this.validatePairs(memberSgSystemIds, pairsToPersist);
      if (pairResult.kind === RESULT_KIND.Fail) return pairResult;

      const referencedComponents: ReferencedComponents = {
        sgSystemIds: sortedUnique(memberSgSystemIds),
        dataLinkSystemIds: sortedUnique(
          candidate.topology.pairs.flatMap(item =>
            item.dataLinks.map(link => link.systemId),
          ),
        ),
        controlLinkSystemIds: sortedUnique(
          candidate.topology.pairs.flatMap(item =>
            item.controlLinks.map(link => link.systemId),
          ),
        ),
      };
      const type = computeManualUsecaseType(candidate.topology);
      const systemId = await idGenerator.getNextId(input.fileSystemId);
      const ref = await staging.repository.create(
        new UseCase({
          systemId,
          fileSystemId: input.fileSystemId,
          keyVector: {
            valueSystemIds: candidate.gkv.map(pair => pair.valueDefSystemId),
          },
          subgraphSystemIds: [...memberSgSystemIds],
          subgraphPairs: [...pairsToPersist],
          type,
        }),
        staging.options,
        referencedComponents,
        collectUsecaseSgkvAdditions([candidate]),
      );
      this.recordChange(staging, ref, CHANGE_OPERATION.Create);
    }
    return Result.ok();
  }

  private recordChange(
    staging: StagingState,
    ucChangeRef: {readonly systemId: number; readonly changeId: number} | null,
    operation: UsecaseChangeDescriptor['operation'],
  ): void {
    if (ucChangeRef === null) return;
    staging.descriptors.set(ucChangeRef.systemId, {
      systemId: ucChangeRef.systemId,
      changeId: ucChangeRef.changeId,
      operation,
      source: staging.options.source,
    });
  }

  private validatePairs(
    subgraphSystemIds: readonly number[],
    pairs: readonly SubgraphPair[],
  ): Result<void> {
    const ids = new Set(subgraphSystemIds);
    for (const pair of pairs) {
      if (
        !ids.has(pair.sourceSubgraphSystemId) ||
        !ids.has(pair.destSubgraphSystemId)
      ) {
        return Result.fail(
          RoutingIssueFactory.stagingPairEndpointMissing(
            pair.sourceSubgraphSystemId,
            pair.destSubgraphSystemId,
          ),
        );
      }
    }
    return Result.ok();
  }

  private async applyStructuralChange(
    staging: StagingState,
    usecase: UseCase,
    delta: StructuralChangeDelta,
    operation: UsecaseChangeDescriptor['operation'] = CHANGE_OPERATION.Update,
    assignments?: readonly UsecaseSgkvAssignment[],
  ): Promise<Result<void>> {
    const result = this.validatePairs(
      [
        ...usecase.subgraphSystemIds.filter(
          id => !(delta.removedSgSystemIds ?? []).includes(id),
        ),
        ...(delta.addedSgSystemIds ?? []),
      ],
      delta.addedPairs ?? [],
    );
    if (result.kind === RESULT_KIND.Fail) return result;
    const ref = await staging.repository.applyStructuralChange(
      usecase.systemId,
      delta,
      staging.options,
      undefined,
      assignments,
    );
    this.recordChange(staging, ref, operation);
    return Result.ok();
  }
}

function sortedUnique(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((left, right) => left - right);
}
