/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import {DATA_LINK_TYPE} from '../../../../domain/entities/usecase-data/links/data-link-type.js';
import type {UsecaseType} from '../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import {USECASE_TYPE} from '../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import type {SubgraphPair} from '../../../ports/persistence/repositories/shared/links-for-pair.js';

/** Classifies a UseCase from its resulting directed pair set. */
export function computeUsecaseType(
  pairs: readonly SubgraphPair[],
  routableDataLinks: readonly DataLink[],
): UsecaseType {
  let hasUnsupportedPair = false;
  let hasEcLink = false;

  for (const pair of pairs) {
    const links = routableDataLinks.filter(
      link =>
        link.sourceSubgraphSystemId === pair.sourceSubgraphSystemId &&
        link.destSubgraphSystemId === pair.destSubgraphSystemId,
    );
    if (links.length === 0) hasUnsupportedPair = true;
    if (links.some(link => link.linkType === DATA_LINK_TYPE.Ec)) {
      hasEcLink = true;
    }
  }

  if (hasEcLink) return USECASE_TYPE.Ec;
  if (hasUnsupportedPair) return USECASE_TYPE.Island;
  return USECASE_TYPE.Linked;
}
