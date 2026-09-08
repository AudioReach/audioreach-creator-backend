/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface ProcessorDefinitionInit {
  systemId: number;
  name: string;
  naturalId: number;
  fileSystemId: number;
}

export class ProcessorDefinition {
  systemId: number;
  name: string;
  readonly naturalId: number;
  fileSystemId: number;

  constructor(initParam: ProcessorDefinitionInit) {
    this.systemId = initParam.systemId;
    this.name = initParam.name;
    this.naturalId = initParam.naturalId;
    this.fileSystemId = initParam.fileSystemId;
  }
}
