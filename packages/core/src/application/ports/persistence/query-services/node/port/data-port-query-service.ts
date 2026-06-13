/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataPortReadModel} from '../../usecase/query-models/data-port-read-model.js';

export interface DataPortQueryService {
  getDataPorts(
    nodeSystemId: number,
    fileSystemId: number,
    applyOverlay?: boolean,
  ): Promise<DataPortReadModel[]>;
}
