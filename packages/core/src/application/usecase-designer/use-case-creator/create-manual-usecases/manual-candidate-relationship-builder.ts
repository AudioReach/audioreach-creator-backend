/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {SubgraphPair} from '../../../../application/ports/persistence/repositories/shared/links-for-pair.js';

/**
 * The complete subgraph scope and the selected UseCases that authorize
 * relationships inside that scope.
 */
export interface ManualCandidateRelationshipInput {
  readonly selectedUsecases: readonly UseCase[];
  readonly subgraphSystemIds: readonly number[];
}

/**
 * Produces the unordered subgraph relationships that discovery should try to
 * support with a data or control link.
 */
export class ManualCandidateRelationshipBuilder {
  /**
   * Selected-selected pairs need explicit UseCase authorization. Any pair
   * touching an out-of-selection subgraph remains eligible for discovery.
   */
  build(input: ManualCandidateRelationshipInput): readonly SubgraphPair[] {
    // These sets make authorization independent of input ordering and remove
    // duplicate subgraph/pair rows before candidate generation begins.
    const selectedIds = new Set(
      input.selectedUsecases.flatMap(usecase => usecase.subgraphSystemIds),
    );
    const authorizedSelectedPairs = new Set(
      input.selectedUsecases.flatMap(usecase =>
        usecase.subgraphPairs.map(pair =>
          unorderedPairKey(
            pair.sourceSubgraphSystemId,
            pair.destSubgraphSystemId,
          ),
        ),
      ),
    );
    // Canonical ordering gives every unordered relationship one stable shape.
    const ids = [...new Set(input.subgraphSystemIds)].sort(
      (left, right) => left - right,
    );
    const candidates: SubgraphPair[] = [];

    // Iterating over indexes prevents both (A, B) and (B, A) candidates.
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        const sourceSubgraphSystemId = ids[left];
        const destSubgraphSystemId = ids[right];
        const bothSelected =
          selectedIds.has(sourceSubgraphSystemId) &&
          selectedIds.has(destSubgraphSystemId);
        if (
          bothSelected &&
          !authorizedSelectedPairs.has(
            unorderedPairKey(sourceSubgraphSystemId, destSubgraphSystemId),
          )
        ) {
          continue;
        }
        candidates.push({sourceSubgraphSystemId, destSubgraphSystemId});
      }
    }
    return candidates;
  }
}

/** Identifies an unordered relationship without changing the emitted pair. */
function unorderedPairKey(left: number, right: number): string {
  return `${Math.min(left, right)}:${Math.max(left, right)}`;
}
