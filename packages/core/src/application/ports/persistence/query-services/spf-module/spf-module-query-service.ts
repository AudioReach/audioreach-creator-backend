/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfModuleReadModel} from './spf-module-read-model.js';
import type {NodeQueryService} from '../node/node-query-service.js';
import type {SpfTuningConfigService} from './tuning/spf-tuning-config-service.js';
import type {Result} from '../../../../shared/result/result.js';
import type {CkvQueryService} from './ckv/ckv-query-service.js';

export interface SpfModuleQueryService {
  readonly ckvQueryService: CkvQueryService;

  /**
   * Returns a single SPF module with ports and definition capabilities.
   * Overlay always applied.
   *
   * Behaviour (FR-1.4):
   *   - Throws `ResourceNotFoundException` when the module does not exist.
   *   - Throws (or rethrows) on any other total failure (DB error, definition failure).
   *   - Never returns `Result.fail` — this method is not `Result`-shaped.
   */
  findOne(
    spfModuleSystemId: number,
    fileSystemId: number,
  ): Promise<SpfModuleReadModel>;

  /**
   * Returns SPF modules for the given system IDs.
   * Overlay always applied.
   * Unknown IDs are silently omitted — partial result.
   * Empty input returns `Result.fail(INVALID_INPUT)` — an empty request is a caller bug.
   */
  findMany(
    systemIds: number[],
    fileSystemId: number,
  ): Promise<Result<SpfModuleReadModel[]>>;

  // Sub-services — reusable directly by handlers that need only ports for a specific node
  readonly nodeQueryService: NodeQueryService;
  readonly spfTuningConfigService: SpfTuningConfigService;
}
