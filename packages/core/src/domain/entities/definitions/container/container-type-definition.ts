/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface ContainerTypeInit {
  systemId: string;
  name: string;
  value: number;
}

export class ContainerType {
  systemId: string;
  name: string;
  value: number;

  constructor(initParam: ContainerTypeInit) {
    this.systemId = initParam.systemId;
    this.name = initParam.name;
    this.value = initParam.value;
  }
}
