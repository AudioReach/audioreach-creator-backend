/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface ValueDefinitionInit {
  systemId: number;
  valueId: number;
  name: string;
  description?: string;
  enumMember?: string;
  specialValue?: string;
}

export class ValueDefinition {
  systemId: number;
  // member of value entity
  readonly valueId: number;
  name: string;
  description: string;
  enumMember: string;
  specialValue: string;
  constructor(initParam: ValueDefinitionInit) {
    this.systemId = initParam.systemId;
    this.valueId = initParam.valueId;
    this.name = initParam.name;
    this.description = initParam.description ?? '';
    this.enumMember = initParam.enumMember ?? '';
    this.specialValue = initParam.specialValue ?? '';
  }
}
