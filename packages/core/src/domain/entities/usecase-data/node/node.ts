/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlPort} from './entities/control-port.js';
import type {DataPort} from './entities/data-port.js';

export const NodeType = {
  Module: 'module',
  Subsystem: 'subsystem',
} as const;

export type NodeType = (typeof NodeType)[keyof typeof NodeType];

export class Node {
  systemId: number;
  readonly parentId?: number;
  readonly type: NodeType;
  fileSystemId: number;

  readonly dataPorts: DataPort[];
  readonly controlPorts: ControlPort[];

  constructor(initparams: {
    systemId: number;
    type: NodeType;
    fileSystemId: number;
    parentId?: number;
    dataPorts: DataPort[];
    controlPorts: ControlPort[];
  }) {
    this.systemId = initparams.systemId;
    this.type = initparams.type;
    this.fileSystemId = initparams.fileSystemId;
    this.parentId = initparams.parentId;
    this.dataPorts = initparams.dataPorts;
    this.controlPorts = initparams.controlPorts;
  }
}
