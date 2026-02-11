/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface PropertyDefinitionInit {
  systemId: number;
  propertyId: number;
  name: string;
  description?: string;
  isVoice?: boolean;
  maxSize?: number;
  propertyStructure: string;
}

export class PropertyDefinition {
  systemId: number;
  readonly propertyId: number;
  name: string;
  description: string;
  isVoice: boolean;
  maxSize: number;
  propertyStructure: string;

  constructor(initParam: PropertyDefinitionInit) {
    this.systemId = initParam.systemId;
    this.propertyId = initParam.propertyId;
    this.name = initParam.name;
    this.description = initParam.description ?? '';
    this.isVoice = initParam.isVoice ?? false;
    this.maxSize = initParam.maxSize ?? 0;
    this.propertyStructure = initParam.propertyStructure;
  }
}
