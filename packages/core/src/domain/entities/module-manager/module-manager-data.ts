/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export type ModuleTypeValue = 2 | 3 | 4 | 5 | 6 | 7;
export type InterfaceTypeValue = 2;
export type InterfaceVersionValue = 3;

export interface ModuleManagerDataInit {
  systemId: number;
  moduleDefinitionSystemId: number;
  moduleType: ModuleTypeValue;
  interfaceType: InterfaceTypeValue;
  interfaceVersion: InterfaceVersionValue;
  fileName: string;
  tag: string;
  fileSystemId: number;
}

export class ModuleManagerData {
  systemId: number;
  readonly moduleDefinitionSystemId: number;
  readonly moduleType: ModuleTypeValue;
  readonly interfaceType: InterfaceTypeValue;
  readonly interfaceVersion: InterfaceVersionValue;
  readonly fileName: string;
  readonly tag: string;
  readonly fileSystemId: number;

  constructor(init: ModuleManagerDataInit) {
    this.systemId = init.systemId;
    this.moduleDefinitionSystemId = init.moduleDefinitionSystemId;
    this.moduleType = init.moduleType;
    this.interfaceType = init.interfaceType;
    this.interfaceVersion = init.interfaceVersion;
    this.fileName = init.fileName;
    this.tag = init.tag;
    this.fileSystemId = init.fileSystemId;
  }
}
