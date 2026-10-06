/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  RESULT_KIND,
  Result,
} from '../../../../../application/shared/result/result.js';
import type {Result as ResultType} from '../../../../../application/shared/result/result.js';
import {CHANGE_OPERATION} from '../../../../shared/change-vocabulary.js';
import {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {UsecaseType} from '../../../../../domain/entities/usecase-data/usecase/usecase-type.js';
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
  type UsecaseChangeDescriptor,
} from '../../contracts/routing-state.js';
import {RoutingIssueFactory} from '../../issues/routing-issue-factory.js';
import {collectUsecaseSgkvAdditions} from '../../shared/routing-sgkv-assignments.js';
import {
  computeManualUsecaseType,
  computeUsecaseType,
} from '../../shared/usecase-type-classifier.js';
import type {StagingState} from './topology-change-stager.js';
import type {SubgraphPair} from '../../../../ports/persistence/repositories/shared/links-for-pair.js';
import {
  candidateDirectedPairs,
  candidateSubgraphSystemIds,
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

/** Applies exact-match, extension, and create classifications in input order. */
export class ClassifiedCandidateStager {
  async stage(
    input: ClassifiedCandidateStagerInput,
  ): Promise<ResultType<void>> {
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
        const pairs = candidateDirectedPairs(classification.candidate);
        const existingPairKeys = new Set(
          classification.existingUsecase.subgraphPairs.map(pair =>
            pairKey(pair),
          ),
        );
        const result = await this.applyStructuralChange(
          staging,
          classification.existingUsecase,
          {
            addedSgSystemIds: candidateSubgraphSystemIds(
              classification.candidate,
            ).filter(systemId => !currentIds.has(systemId)),
            addedPairs: pairs.filter(
              pair => !existingPairKeys.has(pairKey(pair)),
            ),
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
      const pairs = candidateDirectedPairs(candidate);
      const pairResult = this.validatePairs(memberSubgraphSystemIds, pairs);
      if (pairResult.kind === RESULT_KIND.Fail) return pairResult;
      const ref = await staging.repository.create(
        new UseCase({
          systemId,
          fileSystemId,
          keyVector: {
            valueSystemIds: candidate.gkv.map(pair => pair.valueDefSystemId),
          },
          subgraphSystemIds: [...memberSubgraphSystemIds],
          subgraphPairs: [...pairs],
          type: computeUsecaseType(pairs, graphSnapshot.routableDataLinks),
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
  ): Promise<ResultType<void>> {
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
      const pairs = candidateDirectedPairs(candidate);
      const pairResult = this.validatePairs(memberSgSystemIds, pairs);
      if (pairResult.kind === RESULT_KIND.Fail) return pairResult;

      const connectedIds = new Set(
        pairs.flatMap(pair => [
          pair.sourceSubgraphSystemId,
          pair.destSubgraphSystemId,
        ]),
      );
      const isolatedSgSystemIds = memberSgSystemIds.filter(
        systemId => !connectedIds.has(systemId),
      );
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
      const type = computeManualUsecaseType(
        candidate.topology,
        isolatedSgSystemIds,
      );
      const systemId = await idGenerator.getNextId(input.fileSystemId);
      const ref = await staging.repository.create(
        new UseCase({
          systemId,
          fileSystemId: input.fileSystemId,
          keyVector: {
            valueSystemIds: candidate.gkv.map(pair => pair.valueDefSystemId),
          },
          subgraphSystemIds: [...memberSgSystemIds],
          subgraphPairs: [...pairs],
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
  ): ResultType<void> {
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
  ): Promise<ResultType<void>> {
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

function pairKey(pair: SubgraphPair): string {
  return `${pair.sourceSubgraphSystemId}>${pair.destSubgraphSystemId}`;
}

function sortedUnique(ids: readonly number[]): number[] {
  return [...new Set(ids)].sort((left, right) => left - right);
}
