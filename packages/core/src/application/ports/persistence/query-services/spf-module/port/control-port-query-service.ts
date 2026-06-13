/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfControlPortReadModel} from './control-port-read-model.js';

export interface ControlPortQueryService {
  getControlPorts(
    nodeSystemId: number,
    fileSystemId: number,
    applyOverlay?: boolean,
  ): Promise<SpfControlPortReadModel[]>;
}
