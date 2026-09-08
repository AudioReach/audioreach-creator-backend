/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const PROPERTY_TYPE = {
  Spf: 'SPF',
  Driver: 'DRIVER',
} as const;

export type PropertyType = (typeof PROPERTY_TYPE)[keyof typeof PROPERTY_TYPE];

export interface PropertyDefinitionInit {
  systemId: number;
  fileSystemId: number;
  naturalId: number;
  name: string;
  type: PropertyType;
  description?: string;
  elementsStructure: string;
  maxSize?: number;
}

export class PropertyDefinition {
  systemId: number;
  fileSystemId: number;
  readonly naturalId: number;
  name: string;
  type: PropertyType;
  description?: string;
  elementsStructure: string;
  maxSize?: number;

  constructor(initParam: PropertyDefinitionInit) {
    this.systemId = initParam.systemId;
    this.fileSystemId = initParam.fileSystemId;
    this.naturalId = initParam.naturalId;
    this.name = initParam.name;
    this.type = initParam.type;
    this.description = initParam.description;
    this.elementsStructure = initParam.elementsStructure;
    this.maxSize = initParam.maxSize;
  }
}
