/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {Node, NodeType} from '../node/node.js';
import type {DataPort} from '../node/entities/data-port.js';
import type {ControlPort} from '../node/entities/control-port.js';

export interface SubsystemInit {
  systemId: number;
  fileSystemId: number;
  parentId?: number;
  name: string;
  subsystemId: number;
  filteredKeySystemIds: number[];
  dataPorts: DataPort[];
  controlPorts: ControlPort[];
}

export class Subsystem extends Node {
  readonly name: string;
  readonly subsystemId: number;
  readonly filteredKeySystemIds: number[];

  constructor(init: SubsystemInit) {
    super({
      systemId: init.systemId,
      type: NodeType.Subsystem,
      fileSystemId: init.fileSystemId,
      parentId: init.parentId,
      dataPorts: init.dataPorts,
      controlPorts: init.controlPorts,
    });
    this.name = init.name;
    this.subsystemId = init.subsystemId;
    this.filteredKeySystemIds = init.filteredKeySystemIds;
  }
}
