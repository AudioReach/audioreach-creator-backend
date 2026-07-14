/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface ProcessorDefinitionInit {
  systemId: number;
  name: string;
  processorDefinitionId: number;
  fileSystemId: number;
}

export class ProcessorDefinition {
  systemId: number;
  name: string;
  readonly processorDefinitionId: number;
  fileSystemId: number;

  constructor(initParam: ProcessorDefinitionInit) {
    this.systemId = initParam.systemId;
    this.name = initParam.name;
    this.processorDefinitionId = initParam.processorDefinitionId;
    this.fileSystemId = initParam.fileSystemId;
  }
}
