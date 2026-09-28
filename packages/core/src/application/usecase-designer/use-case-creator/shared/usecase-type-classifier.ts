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

export interface UsecasePairSupport {
  readonly isEc: boolean;
}

export type UsecasePairSupportResolver = (
  pair: SubgraphPair,
) => readonly UsecasePairSupport[];

export function computeUsecaseTypeFromPairSupport(
  pairs: readonly SubgraphPair[],
  resolveSupport: UsecasePairSupportResolver,
): UsecaseType {
  let hasUnsupportedPair = false;
  let hasEcLink = false;

  for (const pair of pairs) {
    const support = resolveSupport(pair);
    if (support.length === 0) hasUnsupportedPair = true;
    if (support.some(link => link.isEc)) hasEcLink = true;
  }

  if (hasEcLink) return USECASE_TYPE.Ec;
  if (hasUnsupportedPair) return USECASE_TYPE.Island;
  return USECASE_TYPE.Linked;
}

export function computeUsecaseType(
  pairs: readonly SubgraphPair[],
  routableDataLinks: readonly DataLink[],
): UsecaseType {
  return computeUsecaseTypeFromPairSupport(pairs, pair =>
    routableDataLinks
      .filter(
        link =>
          link.sourceSubgraphSystemId === pair.sourceSubgraphSystemId &&
          link.destSubgraphSystemId === pair.destSubgraphSystemId,
      )
      .map(link => ({isEc: link.linkType === DATA_LINK_TYPE.Ec})),
  );
}
