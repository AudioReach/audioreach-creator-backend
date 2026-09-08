/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface DataPortDefinitionInit {
  naturalId: number;
  name?: string;
}

export class DataPortDefinition {
  readonly naturalId: number;
  name?: string;

  constructor(initParam: DataPortDefinitionInit) {
    this.naturalId = initParam.naturalId;
    this.name = initParam.name;
  }
}
