/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspBaseArrayElement} from './base-array-element.js';
import {AwspConfigElement} from './config-element.js';
import type {DisplayType} from './type/display-type.js';
import type {ElementPolicy} from './type/element-policy.js';
import {BaseElementSchema} from './base-element.schema.js';

/**
 * Represents a configuration element array.
 * Extends ArrayElement with configuration-specific properties.
 */
export class AwspConfigElementArray extends AwspBaseArrayElement {
  /** Key configuration element (required) */
  keyConfigElement!: AwspConfigElement;

  /** Display type for the configuration element array (optional) */
  displayType?: DisplayType;

  /** Policy for the configuration element array (optional) */
  policy?: ElementPolicy;

  /** Indicates if the element array is read-only (optional) */
  isReadOnly?: boolean;

  /**
   * Parse JSON data into AwspConfigElementArray instance
   * @param data - Raw JSON data
   * @returns Validated AwspConfigElementArray instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspConfigElementArray {
    const validated = BaseElementSchema.parse(data);
    return this.hydrateInstance(new AwspConfigElementArray(), validated, [
      {field: 'keyConfigElement', hydrator: AwspConfigElement},
    ]);
  }

  /**
   * Serialize AwspConfigElementArray to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      ...this.serializeBaseArrayElementFields(),
      keyConfigElement: this.serializeField(this.keyConfigElement),
      displayType: this.displayType,
      policy: this.policy,
      isReadOnly: this.isReadOnly,
    };
  }
}
