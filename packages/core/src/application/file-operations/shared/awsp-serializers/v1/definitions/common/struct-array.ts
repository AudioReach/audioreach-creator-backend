/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspBaseArrayElement} from './base-array-element.js';
import {AwspStruct} from './struct.js';
import {BaseElementSchema} from './base-element.schema.js';

/**
 * Represents a structure array element.
 * Extends ArrayElement with structure-specific properties.
 */
export class AwspStructArray extends AwspBaseArrayElement {
  /** Key structure definition (required) */
  keyStructureDefinition!: AwspStruct;

  /**
   * Parse JSON data into AwspStructArray instance
   * @param data - Raw JSON data
   * @returns Validated AwspStructArray instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspStructArray {
    const validated = BaseElementSchema.parse(data);
    return this.hydrateInstance(new AwspStructArray(), validated, [
      {field: 'keyStructureDefinition', hydrator: AwspStruct},
    ]);
  }

  /**
   * Serialize AwspStructArray to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      ...this.serializeBaseArrayElementFields(),
      keyStructureDefinition: this.serializeField(this.keyStructureDefinition),
    };
  }
}
