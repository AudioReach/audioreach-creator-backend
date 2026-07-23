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
  intentTypeIds?: number[]; // intent TYPE ids (DynamicIntentDefinition.intentId) — needed for FR-CPCA-01
}

export class ControlPort {
  systemId: number;
  readonly portId: number;
  readonly isStatic: boolean;
  nodeSystemId: number;
  readonly name?: string;
  readonly intentIds: number[]; // intent instance system_ids
  readonly intentTypeIds: number[]; // intent type ids — parallel to intentIds

  constructor(initParam: ControlPortInit) {
    this.systemId = initParam.systemId;
    this.portId = initParam.portId;
    this.isStatic = initParam.isStatic;
    this.nodeSystemId = initParam.nodeSystemId;
    this.name = initParam.name;
    this.intentIds = initParam.intentSystemIds;
    this.intentTypeIds = initParam.intentTypeIds ?? [];
  }
}
