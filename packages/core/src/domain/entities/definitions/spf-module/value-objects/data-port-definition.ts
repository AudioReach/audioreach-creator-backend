/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface DataPortDefinitionInit {
  dataPortId: number;
  name?: string;
}

export class DataPortDefinition {
  readonly dataPortId: number;
  name?: string;

  constructor(initParam: DataPortDefinitionInit) {
    this.dataPortId = initParam.dataPortId;
    this.name = initParam.name;
  }
}
