/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface ControlPortInit {
  systemId: number;
  portId: number;
  isStatic: boolean;
  nodeSystemId: number;
  name?: string;
  intentSystemIds: number[];
}

export class ControlPort {
  readonly systemId: number;
  readonly portId: number;
  readonly isStatic: boolean;
  readonly nodeSystemId: number;
  readonly name?: string;
  readonly intentSystemIds: number[];

  constructor(initParam: ControlPortInit) {
    this.systemId = initParam.systemId;
    this.portId = initParam.portId;
    this.isStatic = initParam.isStatic;
    this.nodeSystemId = initParam.nodeSystemId;
    this.name = initParam.name;
    this.intentSystemIds = initParam.intentSystemIds;
  }
}
