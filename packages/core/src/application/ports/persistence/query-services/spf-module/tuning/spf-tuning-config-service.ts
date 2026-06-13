/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfModuleTuningConfigReadModel} from './tuning-config-read-model.js';

/**
 * Aggregate query service for SPF module tuning configuration.
 *
 * Owns all reads needed to build the tuning catalogue view:
 *   - All CKV bins with key-value selectors and parameter names
 *   - All tag groups with their TKV bins and parameter names
 *
 * Binary payload loading (cal-data, tag-data) is NOT part of this service.
 * That is handled by CkvQueryService and future TkvQueryService.
 *
 * Future: tkvQueryService will be added here when TKV query service is implemented.
 */
export interface SpfTuningConfigService {
  /**
   * Returns the full tuning catalogue for a module.
   * Includes all CKVs with param names and all tags with their TKVs with param names.
   * applyOverlay: true → reflect staged CKV/TKV changes from active edit session.
   */
  getModuleTuningConfig(
    spfModuleSystemId: number,
    fileSystemId: number,
    applyOverlay?: boolean,
  ): Promise<SpfModuleTuningConfigReadModel>;
}
