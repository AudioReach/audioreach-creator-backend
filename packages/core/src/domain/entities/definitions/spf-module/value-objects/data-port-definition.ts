/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface DataPortDefinitionInit {
  dataPortId: number;
  dataPortName: string;
}

export class DataPortDefinition {
  readonly dataPortId: number;
  dataPortName: string;

  constructor(initParam: DataPortDefinitionInit) {
    this.dataPortId = initParam.dataPortId;
    this.dataPortName = initParam.dataPortName;
  }
}
