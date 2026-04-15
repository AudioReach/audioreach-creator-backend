/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Expose} from 'class-transformer';
import type {AwspToolPolicy} from '../type/tool-policy.js';
import type {AwspPidType} from '../type/pid-type.js';
import type {AwspDefinitionElement} from '../../common/element-types.js';

/**
 * Represents a parameter definition with tool policy and elements.
 */
export class AwspParamDefinition {
  /** Parameter identifier (required) */
  @Expose()
  id!: number;

  /** Parameter name (required) */
  @Expose()
  name!: string;

  /** Tool policies (required) */
  @Expose()
  toolPolicies!: AwspToolPolicy[];

  /** PID type (required) */
  @Expose()
  pidType!: AwspPidType;

  /** List of element associated with this ParamDefinition (required) */
  @Expose()
  elements!: AwspDefinitionElement[];

  /** Parameter description (optional) */
  @Expose()
  description?: string;

  /** Maximum size (optional) */
  @Expose()
  maxSize?: number;

  /** Indicates if parameter is neural network related (optional) */
  @Expose()
  isNeuralNet?: boolean;

  /** Indicates if parameter is offloaded (optional) */
  @Expose()
  isOffloaded?: boolean;

  /** Indicates if hardware acceleration is enabled (optional) */
  @Expose()
  isHwAccel?: boolean;

  /** Indicates if hardware acceleration enable flag (optional) */
  @Expose()
  isHwAccelEnable?: boolean;

  /** Indicates if parameter is hidden (optional) */
  @Expose()
  isHidden?: boolean;

  /** Indicates if parameter is read-only (optional) */
  @Expose()
  isReadOnly?: boolean;

  /** Indicates if parameter is deprecated (optional) */
  @Expose()
  deprecated?: boolean;
}
