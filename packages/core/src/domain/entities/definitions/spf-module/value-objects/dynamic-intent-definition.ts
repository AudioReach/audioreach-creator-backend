/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface DynamicIntentDefinitionInit {
  naturalId: number;
  name: string;
  maxPort: number;
}

export class DynamicIntentDefinition {
  readonly naturalId: number;
  name: string;
  maxPort: number;

  constructor(initParam: DynamicIntentDefinitionInit) {
    this.naturalId = initParam.naturalId;
    this.name = initParam.name;
    this.maxPort = initParam.maxPort;
  }
}
