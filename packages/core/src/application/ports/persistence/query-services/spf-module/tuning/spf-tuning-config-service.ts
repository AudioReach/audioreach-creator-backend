/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  CkvReadModel,
  TagReadModel,
  CkvParamReadModel,
} from './tuning-config-read-model.js';
import type {ConfigurationIncludes} from '../../configuration-includes.js';
import type {Result} from '../../../../../shared/result/result.js';

/**
 * Category service for SPF module tuning data.
 *
 * Owns CKV and TKV row loading and their session overlay.
 * Delegates key-value pair resolution to KeyValueDefQueryService.
 *
 * ConfigurationIncludes controls QueryBuilder joins and mapping depth for
 * methods that have a fullDetails-gated dimension (params/payload). CKVs
 * have no such dimension, so getModuleCkvs takes no includes param.
 *
 * Overlay always applied.
 */
export interface SpfTuningConfigService {
  getModuleCkvs(
    spfModuleSystemId: number,
    fileSystemId: number,
  ): Promise<Result<CkvReadModel[]>>;

  getModuleCkvParams(
    ckvSystemId: number,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<CkvParamReadModel[]>>;

  getModuleTags(
    spfModuleSystemId: number,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<TagReadModel[]>>;
}
