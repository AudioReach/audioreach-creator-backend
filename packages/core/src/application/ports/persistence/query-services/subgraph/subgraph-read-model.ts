/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyValuePairListReadModel} from '../usecase/query-models/key-vector-read-model.js';

export interface SubgraphReadModel {
  readonly systemId: number;
  readonly subgraphId: number;
  readonly name: string;
  readonly isExported: boolean;
  readonly sgkvs: KeyValuePairListReadModel[] | null;
}
