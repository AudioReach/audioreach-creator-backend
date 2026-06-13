/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ReadModelBase} from '../../../../shared/read-model-base.js';
import type {SpfDataPortReadModel} from './port/data-port-read-model.js';
import type {SpfControlPortReadModel} from './port/control-port-read-model.js';

export interface SpfModuleReadModel extends ReadModelBase {
  readonly parentId?: number;
  readonly instanceId: number;
  readonly alias: string;
  readonly definitionSystemId: number;
  readonly name: string;
  readonly moduleId: number;
  readonly subgraphId: number;
  readonly containerId: number;
  readonly maxInputPortsSupported: number;
  readonly maxOutputPortsSupported: number;
  readonly maxControlPortsSupported: number;
  readonly dataPorts: SpfDataPortReadModel[];
  readonly controlPorts: SpfControlPortReadModel[];
}
