/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ParamType} from '../types/param-type.js';
import type {ToolPolicy} from '../types/tool-policy-type.js';

export interface ParamDefinitionInit {
  systemId: number;
  paramId: number;
  name: string;
  description?: string;
  maxSize?: number;
  toolPolicies: ToolPolicy[];
  type: ParamType;
  elementsStructure: string;
}

export class ParamDefinition {
  systemId: number;
  readonly paramId: number;
  name: string;
  description?: string;
  maxSize?: number;
  toolPolicies: ToolPolicy[];
  pidType: ParamType;
  elementsStructure: string;

  constructor(initParam: ParamDefinitionInit) {
    this.systemId = initParam.systemId;
    this.paramId = initParam.paramId;
    this.name = initParam.name;
    this.description = initParam.description;
    this.maxSize = initParam.maxSize;
    this.toolPolicies = initParam.toolPolicies;
    this.pidType = initParam.type;
    this.elementsStructure = initParam.elementsStructure;
  }
}
