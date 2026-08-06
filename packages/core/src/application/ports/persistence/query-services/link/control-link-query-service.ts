/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Result} from '../../../../shared/result/result.js';
import type {ControlLinkReadModel} from './control-link-read-model.js';

export interface ControlLinkQueryService {
  /**
   * Returns control links for the given usecase system IDs.
   * Includes NORMAL and INTER_USECASE links.
   * Deduplicated across usecases. Overlay applied.
   */
  findByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<ControlLinkReadModel[]>>;

  /**
   * Returns NORMAL control links for a single subgraph.
   * Cross-subgraph links are excluded. Overlay applied.
   */
  findBySubgraphId(
    subgraphId: number,
    fileSystemId: number,
  ): Promise<Result<ControlLinkReadModel[]>>;
}
