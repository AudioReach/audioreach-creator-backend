/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION} from '../../../../shared/change-vocabulary.js';
import type {UseCase} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {RoutingInput} from '../../contracts/routing-input.js';
import {
  MDF_TOPOLOGY_REWRITE_KIND,
  USECASE_TOPOLOGY_DECISION_KIND,
  type MdfNormalizationDecision,
  type UsecaseTopologyDecision,
} from '../../contracts/routing-state.js';
import {directedPairKeyOf} from '../../shared/usecase-topology.js';

function matchesManualProjection(
  decision: MdfNormalizationDecision,
  manualUsecase: UseCase,
): boolean {
  // Pair direction is part of the topology, so compare stable directed keys.
  const manualPairKeys = new Set(
    manualUsecase.subgraphPairs.map(pair => directedPairKeyOf(pair)),
  );
  const manualMemberIds = new Set(manualUsecase.subgraphSystemIds);

  return decision.rewrites.every(rewrite => {
    // A manual topology is not equivalent if it keeps a pre-normalization pair,
    // such as `10 → 30` after collapsing `10 → 30 → 20` to `10 → 20`.
    if (
      rewrite.committedPairs.some(pair =>
        manualPairKeys.has(directedPairKeyOf(pair)),
      )
    ) {
      return false;
    }
    // The manual edit must contain every replacement pair for this rewrite.
    if (
      !rewrite.normalizedPairs.every(pair =>
        manualPairKeys.has(directedPairKeyOf(pair)),
      )
    ) {
      return false;
    }
    if (rewrite.kind === MDF_TOPOLOGY_REWRITE_KIND.DirectToMdf) {
      // Expansion is equivalent only when the inserted MDF members are present.
      return rewrite.mdfSubgraphSystemIds.every(id => manualMemberIds.has(id));
    }
    // Collapse is equivalent only when the removed MDF members are absent.
    return !rewrite.mdfSubgraphSystemIds.some(id => manualMemberIds.has(id));
  });
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
      if (decision.kind !== USECASE_TOPOLOGY_DECISION_KIND.MdfNormalization)
        return true;
      const manualUsecase = manualUpdates.get(decision.usecase.systemId);
      return (
        manualUsecase === undefined ||
        !matchesManualProjection(decision, manualUsecase)
      );
    });
  }
}
