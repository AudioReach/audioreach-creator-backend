/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface DynamicIntentDefinitionInit {
  intentId: number;
  name: string;
  maxPort: number;
}

export class DynamicIntentDefinition {
  readonly intentId: number;
  name: string;
  maxPort: number;

  constructor(initParam: DynamicIntentDefinitionInit) {
    this.intentId = initParam.intentId;
    this.name = initParam.name;
    this.maxPort = initParam.maxPort;
  }
}
