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
  parentSystemId?: number;
  name: string;
  naturalId: number;
  filteredKeySystemIds: number[];
  dataPorts: DataPort[];
  controlPorts: ControlPort[];
}

export class Subsystem extends Node {
  readonly name: string;
  readonly naturalId: number;
  readonly filteredKeySystemIds: number[];

  constructor(init: SubsystemInit) {
    super({
      systemId: init.systemId,
      type: NodeType.Subsystem,
      fileSystemId: init.fileSystemId,
      parentSystemId: init.parentSystemId,
      dataPorts: init.dataPorts,
      controlPorts: init.controlPorts,
    });
    this.name = init.name;
    this.naturalId = init.naturalId;
    this.filteredKeySystemIds = init.filteredKeySystemIds;
  }
}
