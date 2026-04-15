/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspBaseElement} from './base-element.js';
import type {DataType} from './type/data-type.js';
import type {DisplayType} from './type/display-type.js';
import type {ElementPolicy} from './type/element-policy.js';

/**
 * Represents a configuration element with data type and display properties.
 * Extends BaseElement with additional configuration-specific properties.
 */
export class AwspConfigElement extends AwspBaseElement {
  /** Data type of the configuration element (required) */
  dataType!: DataType;

  /** Default value for the configuration element (required) */
  defaultValue!: string;

  /** Display type for the configuration element (optional) */
  displayType?: DisplayType;

  /** Policy for the configuration element (optional) */
  policy?: ElementPolicy;

  /** Indicates if the element is read-only (optional) */
  isReadOnly?: boolean;

  /** Display name for the configuration element (optional) */
  displayName?: string;

  /** Unit string for the configuration element (optional) */
  unitStr?: string;

  /** Q format string (optional) */
  qFormat?: string;

  /** Precision value (optional) */
  precision?: number;

  /** List of elements linked by formula (optional) */
  linkedByForFormula?: string[];

  /** List of default data dependencies (optional) */
  defaultDataDepends?: string[];
}
