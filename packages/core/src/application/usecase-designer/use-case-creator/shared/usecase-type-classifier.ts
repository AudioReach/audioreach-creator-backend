/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Computes the resulting UseCase type from pair support.
 *
 * Used by topology decision analysis, routing-change staging, and collision
 * resolution staging.
 */
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import {DATA_LINK_TYPE} from '../../../../domain/entities/usecase-data/links/data-link-type.js';
import type {UsecaseType} from '../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import {USECASE_TYPE} from '../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import type {SubgraphPair} from '../../../ports/persistence/repositories/shared/links-for-pair.js';
import type {ManualTopology} from '../contracts/routing-input.js';

export interface UsecasePairSupport {
  readonly isEc: boolean;
}

export type UsecasePairSupportResolver = (
  pair: SubgraphPair,
) => readonly UsecasePairSupport[];

/**
 * True when a data link supports this pair in its stored direction. A stored
 * pair carries no provenance, so this is how an existing UseCase's routing
 * pairs are told apart from its control-link pairs.
 */
export function hasDirectedDataLinkSupport(
  pair: SubgraphPair,
  routableDataLinks: readonly DataLink[],
): boolean {
  return routableDataLinks.some(
    link =>
      link.sourceSubgraphSystemId === pair.sourceSubgraphSystemId &&
      link.destSubgraphSystemId === pair.destSubgraphSystemId,
  );
}

export function computeUsecaseTypeFromPairSupport(
  memberSubgraphSystemIds: readonly number[],
  pairs: readonly SubgraphPair[],
  resolveSupport: UsecasePairSupportResolver,
): UsecaseType {
  let hasEcLink = false;
  const dataConnected = new Set<number>();

  for (const pair of pairs) {
    const support = resolveSupport(pair);
    if (support.length === 0) continue;
    dataConnected.add(pair.sourceSubgraphSystemId);
    dataConnected.add(pair.destSubgraphSystemId);
    if (support.some(link => link.isEc)) hasEcLink = true;
  }

  if (hasEcLink) return USECASE_TYPE.Ec;
  if (pairs.length === 0) return USECASE_TYPE.Linked;
  if (memberSubgraphSystemIds.some(id => !dataConnected.has(id)))
    return USECASE_TYPE.Island;
  return USECASE_TYPE.Linked;
}

export function computeUsecaseType(
  memberSubgraphSystemIds: readonly number[],
  pairs: readonly SubgraphPair[],
  routableDataLinks: readonly DataLink[],
): UsecaseType {
  return computeUsecaseTypeFromPairSupport(
    memberSubgraphSystemIds,
    pairs,
    pair =>
      routableDataLinks
        .filter(
          link =>
            link.sourceSubgraphSystemId === pair.sourceSubgraphSystemId &&
            link.destSubgraphSystemId === pair.destSubgraphSystemId,
        )
        .map(link => ({isEc: link.linkType === DATA_LINK_TYPE.Ec})),
  );
}

export function computeManualUsecaseType(
  manualTopology: ManualTopology,
): UsecaseType {
  if (
    manualTopology.pairs.some(item =>
      item.dataLinks.some(link => link.linkType === DATA_LINK_TYPE.Ec),
    )
  ) {
    return USECASE_TYPE.Ec;
  }
  if (
    manualTopology.isolatedSubgraphSystemIds.length > 0 ||
    manualTopology.pairs.some(item => item.controlLinks.length > 0)
  ) {
    return USECASE_TYPE.Island;
  }
  return USECASE_TYPE.Linked;
}
