/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Result} from '../../../../shared/result/result.js';
import type {DataLinkReadModel} from './data-link-read-model.js';

export interface DataLinkQueryService {
  /**
   * Returns data links for the given usecase system IDs.
   * Includes INTRA_SUBGRAPH (via use_case_subgraphs) and
   * INTRA_USECASE (via use_case_subgraph_pairs) links.
   * Deduplicated across usecases. Overlay applied.
   */
  findByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<DataLinkReadModel[]>>;

  /**
   * Returns INTRA_SUBGRAPH data links for a single subgraph.
   * Cross-subgraph links are excluded. Overlay applied.
   */
  findBySubgraphId(
    subgraphId: number,
    fileSystemId: number,
  ): Promise<Result<DataLinkReadModel[]>>;
}
