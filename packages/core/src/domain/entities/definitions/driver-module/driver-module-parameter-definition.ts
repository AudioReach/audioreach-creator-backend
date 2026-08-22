/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface DriverModuleParameterDefinitionInit {
  systemId: number;
  parameterId: number;
  name?: string;
  description?: string;
  maxSize: number;
  paramStructure: string; // JSON string
  driverModuleDefinitionSystemId: number;
  copySrcParamId?: number;
}

/**
 * Represents a parameter definition for a driver module.
 * Contains metadata and structure information for driver module parameters.
 */
export class DriverModuleParameterDefinition {
  systemId: number;
  parameterId: number;
  name?: string;
  description?: string;
  maxSize: number;
  paramStructure: string; // JSON string
  driverModuleDefinitionSystemId: number;
  copySrcParamId?: number;

  constructor(init: DriverModuleParameterDefinitionInit) {
    this.systemId = init.systemId;
    this.parameterId = init.parameterId;
    this.name = init.name;
    this.description = init.description;
    this.maxSize = init.maxSize;
    this.paramStructure = init.paramStructure;
    this.driverModuleDefinitionSystemId = init.driverModuleDefinitionSystemId;
    this.copySrcParamId = init.copySrcParamId;
  }
}
