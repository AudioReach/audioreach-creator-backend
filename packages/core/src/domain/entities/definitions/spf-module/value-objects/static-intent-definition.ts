/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface StaticIntentDefinitionInit {
  systemId: number;
  naturalId: number;
  name: string;
}

export class StaticIntentDefinition {
  readonly systemId: number;
  readonly naturalId: number;
  name: string;

  constructor(initParam: StaticIntentDefinitionInit) {
    this.naturalId = initParam.naturalId;
    this.systemId = initParam.systemId;
    this.name = initParam.name;
  }
}
