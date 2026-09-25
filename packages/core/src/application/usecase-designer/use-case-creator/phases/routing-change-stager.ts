/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  RESULT_KIND,
  Result,
} from '../../../../application/shared/result/result.js';
import type {Result as ResultType} from '../../../../application/shared/result/result.js';
import {SOURCE, CHANGE_OPERATION} from '../../../shared/change-vocabulary.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import {
  USECASE_TYPE,
  type UsecaseType,
} from '../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import type {SubgraphPair} from '../../../ports/persistence/repositories/shared/links-for-pair.js';
import type {
  UsecaseRepository,
  UsecaseSgkvAssignment,
} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {RoutingContext} from '../contracts/routing-context.js';
import type {
  RoutingCombination,
  UsecaseChangeDescriptor,
} from '../contracts/routing-state.js';
import {RoutingIssueFactory} from '../issues/routing-issue-factory.js';
import {collectUsecaseSgkvAdditions} from '../shared/routing-sgkv-assignments.js';
import {computeUsecaseType} from '../shared/usecase-type-classifier.js';

/** Per-invocation state shared by staging helpers; never retained on the service. */
interface StagingState {
  readonly repository: UsecaseRepository;
  readonly options: {readonly source: typeof SOURCE.AutoRouting};
  readonly descriptors: Map<number, UsecaseChangeDescriptor>;
}

interface StructuralChangeDelta {
  readonly addedSgSystemIds?: readonly number[];
  readonly removedSgSystemIds?: readonly number[];
  readonly addedPairs?: readonly SubgraphPair[];
  readonly removedPairs?: readonly SubgraphPair[];
  readonly newType?: UsecaseType;
  readonly cancelPendingDelete?: boolean;
}

export class RoutingChangeStager {
  // This method deliberately preserves the routing phase order in one transaction.
  // eslint-disable-next-line sonarjs/cognitive-complexity
  async run(
    context: RoutingContext,
    uow: UnitOfWork,
    idGenerator: IdGenerationPort,
  ): Promise<ResultType<void>> {
    const staging: StagingState = {
      repository: uow.getUsecaseRepository(),
      options: {source: SOURCE.AutoRouting},
      descriptors: new Map<number, UsecaseChangeDescriptor>(),
    };

    // Apply deletion analysis before routing results
    // update or create UseCases.
    for (const mark of [
      ...(context.deletionAnalysis?.markedForDeletion ?? []),
    ].sort((left, right) => left.usecase.systemId - right.usecase.systemId)) {
      this.recordChange(
        staging,
        await staging.repository.delete(mark.usecase.systemId, staging.options),
        CHANGE_OPERATION.Delete,
      );
    }

    // Retained UseCases lose components removed from the current routing scope.
    for (const preserved of [
      ...(context.deletionAnalysis?.preservedUsecases ?? []),
    ].sort((left, right) => left.usecase.systemId - right.usecase.systemId)) {
      const dropped = new Set(preserved.droppedSubgraphSystemIds);
      const removedPairs = preserved.usecase.subgraphPairs.filter(
        pair =>
          dropped.has(pair.sourceSubgraphSystemId) ||
          dropped.has(pair.destSubgraphSystemId),
      );
      const result = await this.applyStructuralChange(
        staging,
        preserved.usecase,
        {
          removedSgSystemIds: [...dropped].sort((left, right) => left - right),
          removedPairs,
        },
      );
      if (result.kind === RESULT_KIND.Fail) return result;
    }

    // Preserve retained island UseCases by updating their topology type.
    for (const island of [
      ...(context.deletionAnalysis?.islandUseCaseCandidates ?? []),
    ].sort((left, right) => left.usecase.systemId - right.usecase.systemId)) {
      const result = await this.applyStructuralChange(staging, island.usecase, {
        newType: USECASE_TYPE.Island,
      });
      if (result.kind === RESULT_KIND.Fail) return result;
    }

    // Apply direction corrections and new pairs identified during island transitions.
    for (const transition of context.islandTransitions) {
      const removedPairs = transition.directionCorrections.map(correction => ({
        sourceSubgraphSystemId: correction.currentSourceSubgraphSystemId,
        destSubgraphSystemId: correction.currentDestSubgraphSystemId,
      }));
      const addedPairs = [
        ...transition.directionCorrections.map(correction => ({
          sourceSubgraphSystemId: correction.newSourceSubgraphSystemId,
          destSubgraphSystemId: correction.newDestSubgraphSystemId,
        })),
        ...transition.addedPairs,
      ];
      const result = await this.applyStructuralChange(
        staging,
        transition.usecase,
        {
          addedSgSystemIds: transition.addedSubgraphSystemIds,
          removedPairs,
          addedPairs,
          newType: USECASE_TYPE.Linked,
        },
      );
      if (result.kind === RESULT_KIND.Fail) return result;
    }

    // Classifications either reuse, extend, or create UseCases from routed paths.
    for (const classification of context.classifiedUcs) {
      // Exact matches are already represented by a committed UseCase.
      if (classification.kind === 'EXACT_MATCH') continue;
      if (classification.kind === 'INTERIOR_EXTENSION') {
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

      const systemId = await idGenerator.getNextId(context.input.fileSystemId);
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
          fileSystemId: context.input.fileSystemId,
          keyVector: {
            valueSystemIds: candidate.gkv.map(pair => pair.valueDefSystemId),
          },
          subgraphSystemIds: [...candidate.path.subgraphSystemIds],
          subgraphPairs: pairs,
          type: computeUsecaseType(
            pairs,
            context.input.graphSnapshot.routableDataLinks,
          ),
        }),
        staging.options,
        undefined,
        collectUsecaseSgkvAdditions([candidate]),
      );
      this.recordChange(staging, ref, CHANGE_OPERATION.Create);
    }

    // The response builder receives only persisted changes, never staging details.
    context.emittedUcChanges.push(...staging.descriptors.values());
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
