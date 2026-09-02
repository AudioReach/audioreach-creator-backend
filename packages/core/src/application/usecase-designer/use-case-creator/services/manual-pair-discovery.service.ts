/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {
  ActiveSubgraphSelection,
  ManualTopology,
} from '../contracts/routing-input.js';

export class ManualPairDiscoveryService {
  // eslint-disable-next-line @typescript-eslint/require-await -- Placeholder service retains its async contract.
  async discover(
    _fileSystemId: number,
    activeSubgraphs: readonly ActiveSubgraphSelection[],
    _excludedDataLinkSystemIds: readonly number[],
    _excludedControlLinkSystemIds: readonly number[],
    _uow: UnitOfWork,
  ): Promise<Result<ManualTopology>> {
    return Result.ok({
      pairs: [],
      supportingDataLinkSystemIds: [],
      supportingControlLinkSystemIds: [],
      isolatedSubgraphSystemIds: activeSubgraphs.map(
        subgraph => subgraph.systemId,
      ),
    });
  }
}
