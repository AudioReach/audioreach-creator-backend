/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfModuleReadModel} from './spf-module-read-model.js';
import type {NodeQueryService} from '../node/node-query-service.js';
import type {SpfTuningConfigService} from './tuning/spf-tuning-config-service.js';
import type {Result} from '../../../../shared/Result/operation-result.js';

export interface SpfModuleQueryService {
  /**
   * Returns a single SPF module with ports and definition capabilities.
   * Overlay always applied.
   * Result.fail(ENTITY_NOT_FOUND) if the module does not exist; also fails on DB error.
   */
  findOne(
    spfModuleSystemId: number,
    fileSystemId: number,
  ): Promise<Result<SpfModuleReadModel>>;

  /**
   * Returns SPF modules for the given system IDs.
   * Overlay always applied.
   * Unknown IDs are silently omitted — partial result.
   * Empty input returns Result.ok([]) without hitting the DB.
   */
  findMany(
    systemIds: number[],
    fileSystemId: number,
  ): Promise<Result<SpfModuleReadModel[]>>;

  // Sub-services — reusable directly by handlers that need only ports for a specific node
  readonly nodeQueryService: NodeQueryService;
  readonly spfTuningConfigService: SpfTuningConfigService;
}
