/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export type {SubgraphPair} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {SubgraphPair} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';

/**
 * Return shape for batched pair-based link queries.
 */
export interface LinksForPair<T> {
  pair: SubgraphPair;
  links: T[];
}
