/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ParamType} from '../enums/param-type.js';
import type {ToolPolicy} from '../enums/tool-policy-type.js';

export interface ParamDefinitionInit {
  systemId: number;
  paramId: string;
  name: string;
  description: string;
  maxSize: number;
  toolPolicies: ToolPolicy[];
  pidType: ParamType;
  paramStructure: string;
}

export class ParamDefinition {
  readonly systemId: number;
  readonly paramId: string;
  name: string;
  description: string;
  maxSize: number;
  toolPolicies: ToolPolicy[];
  pidType: ParamType;
  paramStructure: string;

  constructor(initParam: ParamDefinitionInit) {
    this.systemId = initParam.systemId;
    this.paramId = initParam.paramId;
    this.name = initParam.name;
    this.description = initParam.description;
    this.maxSize = initParam.maxSize;
    this.toolPolicies = initParam.toolPolicies;
    this.pidType = initParam.pidType;
    this.paramStructure = initParam.paramStructure;
  }
}
