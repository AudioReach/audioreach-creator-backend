/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SubgraphReadModel} from './subgraph-read-model.js';
import type {ConfigurationIncludes} from '../configuration-includes.js';
import type {Result} from '../../../../shared/result/result.js';

export interface SubgraphQueryService {
  /**
   * Returns every SubgraphReadModel for the given fileSystemId.
   * Overlay is always applied internally — no applyOverlay flag.
   *
   * summary (default) → identity fields only, sgkvs: null
   * fullDetails       → summary + sgkvs resolved (same key-value resolution
   *                      findMany uses)
   */
  findAll(
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<SubgraphReadModel[]>>;

  /**
   * Returns SubgraphReadModel[] for the given systemIds, with SGKVs resolved
   * (full detail — the query-by-id path is the one callers use to inspect a
   * specific subgraph's key-value data).
   * Overlay is always applied internally — no applyOverlay flag.
   * Unknown systemIds are silently omitted — partial result.
   */
  findMany(
    systemIds: number[],
    fileSystemId: number,
  ): Promise<Result<SubgraphReadModel[]>>;
}
