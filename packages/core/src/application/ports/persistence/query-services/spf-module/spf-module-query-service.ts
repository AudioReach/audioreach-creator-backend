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
   * Returns `Result.fail` with `ENTITY_NOT_FOUND` if the module does not exist.
   * The caller (core handler) is responsible for deciding whether to throw.
   */
  getSpfModule(
    spfModuleSystemId: number,
    fileSystemId: number,
  ): Promise<Result<SpfModuleReadModel>>;

  /**
   * Returns SPF modules for the given system IDs.
   * Overlay always applied.
   * Unknown IDs are silently omitted — partial result.
   * Empty input returns `Result.fail(INVALID_INPUT)` — an empty request is a caller bug.
   */
  getSpfModules(
    systemIds: number[],
    fileSystemId: number,
  ): Promise<Result<SpfModuleReadModel[]>>;

  /**
   * Returns all SPF modules reachable from the given usecase system IDs.
   * Scoped via use_case_subgraphs → spf_modules.subgraph_system_id.
   * A module shared across multiple usecases appears ONCE — deduplicated by systemId.
   * Overlay applied.
   */
  findByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<SpfModuleReadModel[]>>;

  /**
   * Returns all SPF modules whose subgraph_system_id = subgraphId.
   * Overlay applied.
   */
  findBySubgraphId(
    subgraphId: number,
    fileSystemId: number,
  ): Promise<Result<SpfModuleReadModel[]>>;

  // Sub-services — reusable directly by handlers that need only ports for a specific node
  readonly nodeQueryService: NodeQueryService;
  readonly spfTuningConfigService: SpfTuningConfigService;
}
