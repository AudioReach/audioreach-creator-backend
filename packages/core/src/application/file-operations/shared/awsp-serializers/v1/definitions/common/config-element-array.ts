/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Type} from 'class-transformer';
import {AwspBaseArrayElement} from './base-array-element.js';
import {AwspConfigElement} from './config-element.js';
import type {DisplayType} from './type/display-type.js';
import type {ElementPolicy} from './type/element-policy.js';

/**
 * Represents a configuration element array.
 * Extends ArrayElement with configuration-specific properties.
 */
export class AwspConfigElementArray extends AwspBaseArrayElement {
  /** Key configuration element (required) */
  @Type(() => AwspConfigElement)
  keyConfigElement!: AwspConfigElement;

  /** Display type for the configuration element array (optional) */
  displayType?: DisplayType;

  /** Policy for the configuration element array (optional) */
  policy?: ElementPolicy;

  /** Indicates if the element array is read-only (optional) */
  isReadOnly?: boolean;
}
