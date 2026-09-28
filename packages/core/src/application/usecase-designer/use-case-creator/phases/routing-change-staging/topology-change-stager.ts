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
import {
  USECASE_TYPE,
  type UsecaseType,
} from '../../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import type {SubgraphPair} from '../../../../ports/persistence/repositories/shared/links-for-pair.js';
import type {
  UsecaseRepository,
  UsecaseSgkvAssignment,
} from '../../../../ports/persistence/repositories/usecase/usecase.repository.js';
import {RoutingIssueFactory} from '../../issues/routing-issue-factory.js';
import type {
  DeleteOrReconstructDecision,
  IslandTransition,
  MdfSubstitutionDecision,
  PreserveUsecaseDecision,
  TopologyChangeAnalysis,
  TransitionToIslandDecision,
  UsecaseChangeDescriptor,
} from '../../contracts/routing-state.js';
import {USECASE_TOPOLOGY_DECISION_KIND as TOPOLOGY_DECISION_KIND} from '../../contracts/routing-state.js';

export interface StagingState {
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

function mdfStructuralDelta(
  decision: MdfSubstitutionDecision,
): StructuralChangeDelta {
  const {structuralChange} = decision;
  return {
    removedPairs: structuralChange.removedPairs,
    addedSgSystemIds: structuralChange.addedSubgraphSystemIds,
    addedPairs: structuralChange.addedPairs,
    ...(structuralChange.resultingType === decision.usecase.type
      ? {}
      : {newType: structuralChange.resultingType}),
  };
}

export interface TopologyChangeStagerInput {
  readonly analysis: TopologyChangeAnalysis;
  readonly islandTransitions: readonly IslandTransition[];
  readonly staging: StagingState;
}

/** Applies finalized structural decisions in the existing persistence order. */
export class TopologyChangeStager {
  async stage(input: TopologyChangeStagerInput): Promise<ResultType<void>> {
    const {analysis, islandTransitions, staging} = input;
    const deleteOrReconstructDecisions = analysis.decisions.filter(
      (decision): decision is DeleteOrReconstructDecision =>
        decision.kind === TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
    );
    const preserveDecisions = analysis.decisions.filter(
      (decision): decision is PreserveUsecaseDecision =>
        decision.kind === TOPOLOGY_DECISION_KIND.Preserve,
    );
    const transitionToIslandDecisions = analysis.decisions.filter(
      (decision): decision is TransitionToIslandDecision =>
        decision.kind === TOPOLOGY_DECISION_KIND.TransitionToIsland,
    );
    const mdfDecisions = analysis.decisions.filter(
      (decision): decision is MdfSubstitutionDecision =>
        decision.kind === TOPOLOGY_DECISION_KIND.MdfSubstitution,
    );

    for (const decision of [...mdfDecisions].sort(
      (left, right) => left.usecase.systemId - right.usecase.systemId,
    )) {
      const result = await this.applyStructuralChange(
        staging,
        decision.usecase,
        mdfStructuralDelta(decision),
        CHANGE_OPERATION.Update,
        decision.structuralChange.sgkvAssignments,
      );
      if (result.kind === RESULT_KIND.Fail) return result;
    }

    for (const decision of [...deleteOrReconstructDecisions].sort(
      (left, right) => left.usecase.systemId - right.usecase.systemId,
    )) {
      this.recordChange(
        staging,
        await staging.repository.delete(
          decision.usecase.systemId,
          staging.options,
        ),
        CHANGE_OPERATION.Delete,
      );
    }

    for (const decision of [...preserveDecisions].sort(
      (left, right) => left.usecase.systemId - right.usecase.systemId,
    )) {
      const dropped = new Set(decision.droppedSubgraphSystemIds);
      const removedPairs = decision.usecase.subgraphPairs.filter(
        pair =>
          dropped.has(pair.sourceSubgraphSystemId) ||
          dropped.has(pair.destSubgraphSystemId),
      );
      const result = await this.applyStructuralChange(
        staging,
        decision.usecase,
        {
          removedSgSystemIds: [...dropped].sort((left, right) => left - right),
          removedPairs,
        },
      );
      if (result.kind === RESULT_KIND.Fail) return result;
    }

    for (const decision of [...transitionToIslandDecisions].sort(
      (left, right) => left.usecase.systemId - right.usecase.systemId,
    )) {
      const dropped = new Set(decision.droppedSubgraphSystemIds);
      const removedPairs = decision.usecase.subgraphPairs.filter(
        pair =>
          dropped.has(pair.sourceSubgraphSystemId) ||
          dropped.has(pair.destSubgraphSystemId),
      );
      const result = await this.applyStructuralChange(
        staging,
        decision.usecase,
        {
          removedSgSystemIds: [...dropped].sort((left, right) => left - right),
          removedPairs,
          newType: USECASE_TYPE.Island,
        },
      );
      if (result.kind === RESULT_KIND.Fail) return result;
    }

    for (const transition of islandTransitions) {
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
