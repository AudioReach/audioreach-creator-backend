/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyValuePairListReadModel} from '../usecase/query-models/key-vector-read-model.js';

export interface VcpmCkvReadModel extends KeyValuePairListReadModel {}

export interface VcpmParameterPayloadReadModel {
  readonly systemId: number;
  readonly vcpmParameterSystemId: number;
  readonly payload: Uint8Array | null;
}

export interface VcpmCalibrationQueryService {
  getCkv(
    fileSystemId: number,
    subgraphSystemId: number,
    ckvSystemId: number,
  ): Promise<VcpmCkvReadModel | null>;

  getPayloads(
    fileSystemId: number,
    subgraphSystemId: number,
    ckvSystemId: number,
    payloadSystemIds?: number[],
  ): Promise<VcpmParameterPayloadReadModel[]>;
}
