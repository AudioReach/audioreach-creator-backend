/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {
  ActiveSubgraphSelection,
  ManualTopology,
} from '../contracts/routing-input.js';

export interface ManualTopologyDiscoveryInput {
  readonly fileSystemId: number;
  readonly selectedUsecases: readonly UseCase[];
  readonly activeSubgraphs: readonly ActiveSubgraphSelection[];
  readonly excludedDataLinkSystemIds: ReadonlySet<number>;
  readonly excludedControlLinkSystemIds: ReadonlySet<number>;
}

/** Contract seam for the manual pair-discovery implementation. */
export class ManualPairDiscoveryService {
  // eslint-disable-next-line @typescript-eslint/require-await -- Placeholder service retains its async contract.
  async discover(
    _input: ManualTopologyDiscoveryInput,
    _uow: UnitOfWork,
  ): Promise<Result<ManualTopology>> {
    return Result.ok({pairs: []});
  }
}
