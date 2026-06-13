/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfModuleTuningConfigReadModel} from './tuning-config-read-model.js';

/**
 * Aggregate query service for SPF module tuning configuration.
 *
 * Owns all reads needed to build the tuning catalogue view:
 *   - CKV bins with key-value selectors and parameter names (when includeCkvs=true)
 *   - Tag groups with their TKV bins and parameter names (when includeTags=true)
 *
 * Binary payload loading (cal-data, tag-data) is NOT part of this service.
 * includeProperties belongs to a separate properties query service (future).
 */
export interface SpfTuningConfigService {
  /**
   * Returns tuning catalogue data for a module.
   * Only the requested sections are loaded — unset sections return empty arrays.
   *
   * includeCkvs:   load all CKV bins with key-value selectors and param names
   * includeTags:   load all tag groups with their TKV bins and param names
   * applyOverlay:  true → reflect staged CKV/TKV changes from active edit session
   */
  getModuleTuningConfig(
    spfModuleSystemId: number,
    fileSystemId: number,
    includeCkvs: boolean,
    includeTags: boolean,
    applyOverlay?: boolean,
  ): Promise<SpfModuleTuningConfigReadModel>;
}
