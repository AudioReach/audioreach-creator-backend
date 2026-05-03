/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface StaticIntentDefinitionInit {
  systemId: number;
  intentId: number;
  name: string;
}

export class StaticIntentDefinition {
  readonly systemId: number;
  readonly intentId: number;
  name: string;

  constructor(initParam: StaticIntentDefinitionInit) {
    this.intentId = initParam.intentId;
    this.systemId = initParam.systemId;
    this.name = initParam.name;
  }
}
