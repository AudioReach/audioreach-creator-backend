/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  RESULT_KIND,
  Result,
} from '../../../../../application/shared/result/result.js';
import type {Result as ResultType} from '../../../../../application/shared/result/result.js';
import {
  SOURCE,
  CHANGE_OPERATION,
} from '../../../../shared/change-vocabulary.js';
import {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {UsecaseType} from '../../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import type {UsecaseSgkvAssignment} from '../../../../ports/persistence/repositories/usecase/usecase.repository.js';
import type {RoutingGraphSnapshot} from '../../contracts/routing-input.js';
import {
  ROUTING_CLASSIFICATION_KIND,
  type ClassifiedUsecase,
  type RoutingCombination,
  type UsecaseChangeDescriptor,
} from '../../contracts/routing-state.js';
import {RoutingIssueFactory} from '../../issues/routing-issue-factory.js';
import {collectUsecaseSgkvAdditions} from '../../shared/routing-sgkv-assignments.js';
import {computeUsecaseType} from '../../shared/usecase-type-classifier.js';
import type {StagingState} from './topology-change-stager.js';
import type {SubgraphPair} from '../../../../ports/persistence/repositories/shared/links-for-pair.js';

export interface ClassifiedCandidateStagerInput {
  readonly classifications: readonly ClassifiedUsecase[];
  readonly staging: StagingState;
  readonly fileSystemId: number;
  readonly snapshot: RoutingGraphSnapshot;
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
    const {classifications, staging, fileSystemId, snapshot, idGenerator} =
      input;
    for (const classification of classifications) {
      if (classification.kind === ROUTING_CLASSIFICATION_KIND.ExactMatch)
        continue;
      if (
        classification.kind === ROUTING_CLASSIFICATION_KIND.InteriorExtension
      ) {
        const currentIds = new Set(
          classification.existingUsecase.subgraphSystemIds,
        );
        const pairs = adjacentPairs(classification.candidate);
        const existingPairKeys = new Set(
          classification.existingUsecase.subgraphPairs.map(pair =>
            pairKey(pair),
          ),
        );
        const result = await this.applyStructuralChange(
          staging,
          classification.existingUsecase,
          {
            addedSgSystemIds:
              classification.candidate.path.subgraphSystemIds.filter(
                systemId => !currentIds.has(systemId),
              ),
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
      const pairs = adjacentPairs(candidate);
      const pairResult = this.validatePairs(
        candidate.path.subgraphSystemIds,
        pairs,
      );
      if (pairResult.kind === RESULT_KIND.Fail) return pairResult;
      const ref = await staging.repository.create(
        new UseCase({
          systemId,
          fileSystemId,
          keyVector: {
            valueSystemIds: candidate.gkv.map(pair => pair.valueDefSystemId),
          },
          subgraphSystemIds: [...candidate.path.subgraphSystemIds],
          subgraphPairs: pairs,
          type: computeUsecaseType(pairs, snapshot.routableDataLinks),
        }),
        staging.options,
        undefined,
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
      source: SOURCE.AutoRouting,
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

function adjacentPairs(candidate: RoutingCombination): SubgraphPair[] {
  return candidate.path.subgraphSystemIds.slice(1).map((dest, index) => ({
    sourceSubgraphSystemId: candidate.path.subgraphSystemIds[index],
    destSubgraphSystemId: dest,
  }));
}
