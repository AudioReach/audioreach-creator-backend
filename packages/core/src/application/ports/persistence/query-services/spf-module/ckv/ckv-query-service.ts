/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ParameterPayloadReadModel} from './ckv-read-model.js';
import type {CkvReadModel} from '../tuning/tuning-config-read-model.js';

export interface CkvQueryService {
  getCkv(
    fileSystemId: number,
    moduleSystemId: number,
    ckvSystemId: number,
  ): Promise<CkvReadModel | null>;
  getCkvPayloads(
    fileSystemId: number,
    moduleSystemId: number,
    ckvSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ParameterPayloadReadModel[]>;
}
