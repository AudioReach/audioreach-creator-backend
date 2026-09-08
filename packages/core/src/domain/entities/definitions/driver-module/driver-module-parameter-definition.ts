/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface DriverModuleParameterDefinitionInit {
  systemId: number;
  naturalId: number;
  name?: string;
  description?: string;
  maxSize: number;
  paramStructure: string; // JSON string
  driverModuleDefinitionSystemId: number;
  copySrcParamNaturalId?: number;
}

/**
 * Represents a parameter definition for a driver module.
 * Contains metadata and structure information for driver module parameters.
 */
export class DriverModuleParameterDefinition {
  systemId: number;
  naturalId: number;
  name?: string;
  description?: string;
  maxSize: number;
  paramStructure: string; // JSON string
  driverModuleDefinitionSystemId: number;
  copySrcParamNaturalId?: number;

  constructor(init: DriverModuleParameterDefinitionInit) {
    this.systemId = init.systemId;
    this.naturalId = init.naturalId;
    this.name = init.name;
    this.description = init.description;
    this.maxSize = init.maxSize;
    this.paramStructure = init.paramStructure;
    this.driverModuleDefinitionSystemId = init.driverModuleDefinitionSystemId;
    this.copySrcParamNaturalId = init.copySrcParamNaturalId;
  }
}
