/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Result} from '../../../../application/shared/result/result.js';
import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {
  ManualTopology,
  RoutingSubgraph,
} from '../contracts/routing-input.js';

export interface ManualTopologyDiscoveryInput {
  readonly selectedUsecases: readonly UseCase[];
  readonly subgraphs: readonly RoutingSubgraph[];
  readonly dataLinks: readonly DataLink[];
  readonly controlLinks: readonly ControlLink[];
}

/** Contract seam for the manual pair-discovery implementation. */
export class ManualPairDiscoveryService {
  discover(_input: ManualTopologyDiscoveryInput): Result<ManualTopology> {
    return Result.ok({pairs: []});
  }
}
