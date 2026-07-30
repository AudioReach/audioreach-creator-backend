/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {PropertyPayloadReadModel} from '../shared/property-payload-read-model.js';
import type {Result} from '../../../../shared/result/result.js';

export interface SubgraphQueryService {
  /**
   * Returns property payloads for the specified subgraph, with session overlay applied.
   *
   * - `Result.fail` — DB error.
   * - `Result.ok(null)` — subgraph does not exist (caller should throw 404).
   * - `Result.ok(PropertyPayloadReadModel[])` — subgraph exists; list may be empty.
   */
  findPropertyPayloads(
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<Result<PropertyPayloadReadModel[] | null>>;
}
