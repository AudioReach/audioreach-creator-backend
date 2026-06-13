/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataPortReadModel} from '../usecase/query-models/data-port-read-model.js';
import type {ControlPortReadModel} from '../usecase/query-models/control-port-read-model.js';
import type {Result} from '../../../../shared/Result/operation-result.js';

/**
 * Common query service for node — used by any node type (SpfModule, Subsystem, etc.).
 *
 * Provides a unified interface for loading data ports and control ports
 * for a given node. Both are always needed together for graph-view assembly,
 * so combining them into one service avoids separate sub-service wiring.
 */
export interface NodeQueryService {
  getDataPorts(
    nodeSystemId: number,
    fileSystemId: number,
    applyOverlay: true,
  ): Promise<Result<DataPortReadModel[]>>;

  getControlPorts(
    nodeSystemId: number,
    fileSystemId: number,
    applyOverlay: true,
  ): Promise<Result<ControlPortReadModel[]>>;
}
