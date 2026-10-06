/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Canonicalizes routing SGKV additions and validates them against GKV values.
 *
 * Used by `RoutingChangeStagingPhase` and `SameGkvCollisionResolutionStager`.
 */
import type {UsecaseSgkvAssignment} from '../../../ports/persistence/repositories/usecase/usecase.repository.js';
import {invariant} from '../../../../shared/assertions/index.js';
import type {UsecaseCandidate} from '../contracts/routing-state.js';
import {candidateSubgraphSystemIds} from './usecase-topology.js';

function canonicalValueSystemIds(ids: Iterable<number>): number[] {
  return [...new Set(ids)].sort((left, right) => left - right);
}

export function collectUsecaseSgkvAdditions(
  candidates: readonly UsecaseCandidate[],
): UsecaseSgkvAssignment[] {
  const seen = new Set<string>();
  const additions: UsecaseSgkvAssignment[] = [];
  for (const candidate of candidates) {
    for (const subgraphSystemId of candidateSubgraphSystemIds(candidate)) {
      const valueDefinitionSystemIds = canonicalValueSystemIds(
        (candidate.sgkvAssignment.get(subgraphSystemId)?.keyValues ?? []).map(
          keyValue => keyValue.valueDefSystemId,
        ),
      );
      const key = `${subgraphSystemId}:${valueDefinitionSystemIds.join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      additions.push({subgraphSystemId, valueDefinitionSystemIds});
    }
  }
  return additions;
}

export function assertSgkvAssignmentsMatchGkv(
  candidate: UsecaseCandidate,
  collisionGkvValueSystemIds: readonly number[],
): void {
  const assignmentValueSystemIds = canonicalValueSystemIds(
    candidateSubgraphSystemIds(candidate).flatMap(subgraphSystemId =>
      (candidate.sgkvAssignment.get(subgraphSystemId)?.keyValues ?? []).map(
        keyValue => keyValue.valueDefSystemId,
      ),
    ),
  );
  const candidateGkvValueSystemIds = canonicalValueSystemIds(
    candidate.gkv.map(keyValue => keyValue.valueDefSystemId),
  );
  invariant(
    assignmentValueSystemIds.join(',') === candidateGkvValueSystemIds.join(','),
    'SGKV assignments do not match candidate GKV',
  );
  invariant(
    candidateGkvValueSystemIds.join(',') ===
      canonicalValueSystemIds(collisionGkvValueSystemIds).join(','),
    'Candidate GKV does not match collision GKV',
  );
}
