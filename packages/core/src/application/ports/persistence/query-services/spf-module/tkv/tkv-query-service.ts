/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {TkvReadModel} from '../tuning/tuning-config-read-model.js';
import type {ParameterPayloadReadModel} from '../ckv/ckv-read-model.js';

export interface TkvQueryService {
  /**
   * Returns the TKV row with its key-value pairs.
   * Scoped to moduleTagIdMapSystemId — returns null if the TKV does not exist
   * under that tag map, or if it was deleted in the active session.
   */
  getTkv(
    fileSystemId: number,
    moduleSystemId: number,
    moduleTagIdMapSystemId: number,
    tkvSystemId: number,
  ): Promise<TkvReadModel | null>;

  /**
   * Returns tkv_parameter_payload rows for the given TKV, session-overlaid.
   * When paramSystemIds is non-empty, filters to those payload PKs only.
   * When empty, returns all payloads under the TKV.
   */
  getTkvPayloads(
    fileSystemId: number,
    moduleSystemId: number,
    tkvSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ParameterPayloadReadModel[]>;
}
