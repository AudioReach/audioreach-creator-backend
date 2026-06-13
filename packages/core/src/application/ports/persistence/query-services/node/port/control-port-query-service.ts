/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlPortReadModel} from '../../usecase/query-models/control-port-read-model.js';

export interface ControlPortQueryService {
  getControlPorts(
    nodeSystemId: number,
    fileSystemId: number,
    applyOverlay?: boolean,
  ): Promise<ControlPortReadModel[]>;
}
