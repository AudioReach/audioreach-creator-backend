/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {AwspToolPolicy} from '../type/tool-policy.js';
import type {AwspPidType} from '../type/pid-type.js';
import type {AwspDefinitionElement} from '../../common/element-types.js';
import {AwspParamDefinitionSchema} from './param-definition.schema.js';
import {BaseDefinition} from '../../common/base-definition.js';

/**
 * Represents a parameter definition with tool policy and elements.
 */
export class AwspParamDefinition extends BaseDefinition {
  /** Parameter identifier (required) */
  id!: number;

  /** Parameter name (required) */
  name!: string;

  /** Tool policies (required) */
  toolPolicies!: AwspToolPolicy[];

  /** PID type (required) */
  pidType!: AwspPidType;

  /** List of element associated with this ParamDefinition (required) */
  elements!: AwspDefinitionElement[];

  /** Parameter description (optional) */
  description?: string;

  /** Maximum size (optional) */
  maxSize?: number;

  /** Indicates if parameter is neural network related (optional) */
  isNeuralNet?: boolean;

  /** Indicates if parameter is offloaded (optional) */
  isOffloaded?: boolean;

  /** Indicates if hardware acceleration is enabled (optional) */
  isHwAccel?: boolean;

  /** Indicates if hardware acceleration enable flag (optional) */
  isHwAccelEnable?: boolean;

  /** Indicates if parameter is hidden (optional) */
  isHidden?: boolean;

  /** Indicates if parameter is read-only (optional) */
  isReadOnly?: boolean;

  /** Indicates if parameter is deprecated (optional) */
  deprecated?: boolean;

  /**
   * Parse JSON data into AwspParamDefinition instance
   * @param data - Raw JSON data
   * @returns Validated AwspParamDefinition instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspParamDefinition {
    const validated = AwspParamDefinitionSchema.parse(data);
    return Object.assign(new AwspParamDefinition(), validated);
  }

  /**
   * Serialize AwspParamDefinition to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      toolPolicies: this.toolPolicies,
      pidType: this.pidType,
      elements: this.serializeField(this.elements),
      description: this.description,
      maxSize: this.maxSize,
      isNeuralNet: this.isNeuralNet,
      isOffloaded: this.isOffloaded,
      isHwAccel: this.isHwAccel,
      isHwAccelEnable: this.isHwAccelEnable,
      isHidden: this.isHidden,
      isReadOnly: this.isReadOnly,
      deprecated: this.deprecated,
    };
  }
}
