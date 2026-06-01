/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DriverModuleParameterDefinition} from './driver-module-parameter-definition.js';

export interface DriverModuleDefinitionInit {
  fileSystemId: number;
  systemId: number;
  moduleDefinitionId: number;
  name: string;
  displayName: string;
  description?: string;
  groupName?: string;
  parameters: DriverModuleParameterDefinition[];
}

/**
 * Represents a driver module definition.
 * Driver modules are system-level modules that interface with hardware drivers.
 * Unlike SPF modules, driver modules have a one-to-one relationship with their instances.
 */
export class DriverModuleDefinition {
  systemId: number;
  readonly moduleDefinitionId: number;
  fileSystemId: number;
  name: string;
  displayName: string;
  description?: string;
  groupName?: string;
  readonly parameters: DriverModuleParameterDefinition[] = [];

  constructor(initParam: DriverModuleDefinitionInit) {
    this.systemId = initParam.systemId;
    this.moduleDefinitionId = initParam.moduleDefinitionId;
    this.fileSystemId = initParam.fileSystemId;
    this.name = initParam.name;
    this.displayName = initParam.displayName;
    this.description = initParam.description;
    this.groupName = initParam.groupName;
    this.parameters = initParam.parameters;
  }
}
