/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfModuleReadModel} from './spf-module-read-model.js';
import type {DataPortQueryService} from '../node/port/data-port-query-service.js';
import type {ControlPortQueryService} from '../node/port/control-port-query-service.js';
import type {SpfTuningConfigService} from './tuning/spf-tuning-config-service.js';

export interface SpfModuleQueryService {
  /**
   * Returns the definitionSystemId for a given SPF module instance.
   * Throws if the module is not found.
   */
  getModuleDefinitionSystemId(spfModuleSystemId: number): Promise<number>;

  /**
   * Returns a single SPF module with ports and definition capabilities.
   * Returns null if the module does not exist.
   */
  findOne(
    spfModuleSystemId: number,
    fileSystemId: number,
    applyOverlay?: boolean,
  ): Promise<SpfModuleReadModel | null>;

  /**
   * Returns SPF modules for the given system IDs.
   * Unknown IDs are silently omitted — partial result.
   * Empty input returns [] without hitting the DB.
   */
  findMany(
    systemIds: number[],
    fileSystemId: number,
    applyOverlay?: boolean,
  ): Promise<SpfModuleReadModel[]>;

  // Sub-services — reusable directly by handlers that need only ports for a specific node
  readonly dataPortQueryService: DataPortQueryService;
  readonly controlPortQueryService: ControlPortQueryService;
  readonly spfTuningConfigService: SpfTuningConfigService;
}
