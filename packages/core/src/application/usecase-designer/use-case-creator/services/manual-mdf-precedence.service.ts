/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION} from '../../../shared/change-vocabulary.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {SubgraphPair} from '../../../ports/persistence/repositories/shared/links-for-pair.js';
import type {RoutingInput} from '../contracts/routing-input.js';
import {
  USECASE_TOPOLOGY_DECISION_KIND,
  type MdfSubstitutionDecision,
  type UsecaseTopologyDecision,
} from '../contracts/routing-state.js';

function pairKey(pair: SubgraphPair): string {
  return `${pair.sourceSubgraphSystemId}->${pair.destSubgraphSystemId}`;
}

function containsAll<T>(
  values: readonly T[],
  required: readonly T[],
  key: (value: T) => string | number,
): boolean {
  const available = new Set(values.map(value => key(value)));
  return required.every(value => available.has(key(value)));
}

function matchesManualProjection(
  decision: MdfSubstitutionDecision,
  manualUsecase: UseCase,
): boolean {
  const removedPairs = decision.substitutions.map(
    substitution => substitution.removedPair,
  );
  const replacementPairs = decision.substitutions.flatMap(
    substitution => substitution.replacementPairs,
  );
  const replacementSubgraphSystemIds = decision.substitutions.flatMap(
    substitution => substitution.replacementSubgraphSystemIds,
  );

  return (
    !removedPairs.some(removedPair =>
      manualUsecase.subgraphPairs.some(
        pair => pairKey(pair) === pairKey(removedPair),
      ),
    ) &&
    containsAll(manualUsecase.subgraphPairs, replacementPairs, pairKey) &&
    containsAll(
      manualUsecase.subgraphSystemIds,
      replacementSubgraphSystemIds,
      value => value,
    )
  );
}

/**
 * Prevents system-owned MDF maintenance from competing with an active manual UC update.
 *
 * A manual edit suppresses only an equivalent MDF decision. It does not hide unrelated
 * deletion impact and never rewrites the manual payload on behalf of automatic routing.
 */
export class ManualMdfPrecedenceService {
  apply(
    input: RoutingInput,
    decisions: readonly UsecaseTopologyDecision[],
  ): readonly UsecaseTopologyDecision[] {
    const manualUpdates = new Map<number, UseCase>();
    for (const edit of input.activeManualUsecaseEdits) {
      if (edit.operation !== CHANGE_OPERATION.Update || edit.usecase === null)
        continue;
      manualUpdates.set(edit.usecase.systemId, edit.usecase);
    }

    return decisions.filter(decision => {
      if (decision.kind !== USECASE_TOPOLOGY_DECISION_KIND.MdfSubstitution)
        return true;
      const manualUsecase = manualUpdates.get(decision.usecase.systemId);
      return (
        manualUsecase === undefined ||
        !matchesManualProjection(decision, manualUsecase)
      );
    });
  }
}
