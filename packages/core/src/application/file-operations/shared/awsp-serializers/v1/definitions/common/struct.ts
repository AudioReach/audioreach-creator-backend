/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspBaseElement} from './base-element.js';
import {AwspConfigElement} from './config-element.js';
import {AwspConfigElementArray} from './config-element-array.js';
import {BaseElementSchema} from './base-element.schema.js';

/**
 * Represents a structure element with children elements.
 * Extends BaseElement with structure-specific properties.
 */
export class AwspStruct extends AwspBaseElement {
  /** Structure type (required) */
  structureType!: string;

  /** List of child elements (required) */
  children!: (AwspConfigElement | AwspConfigElementArray | AwspStruct)[];

  /**
   * Hydrate a child element based on its elementType
   * @param child - Raw child element data
   * @returns Hydrated child element
   */
  private static hydrateChild(
    child: unknown,
  ): AwspConfigElement | AwspConfigElementArray | AwspStruct {
    const childRecord = child as Record<string, unknown>;
    const elementType = childRecord.elementType as string;

    // Discriminate based on elementType
    if (elementType === 'STRUCT' || elementType === 'Struct') {
      return AwspStruct.fromJSON(child);
    }
    if (
      elementType === 'CONFIG_ELEMENT_ARRAY' ||
      elementType === 'STRUCT_ARRAY'
    ) {
      return AwspConfigElementArray.fromJSON(child);
    }
    // Default to CONFIG or CONFIG_ELEMENT
    return AwspConfigElement.fromJSON(child);
  }

  /**
   * Parse JSON data into AwspStruct instance
   * @param data - Raw JSON data
   * @returns Validated AwspStruct instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspStruct {
    const validated = BaseElementSchema.parse(data);
    const validatedRecord = validated as Record<string, unknown>;

    // Hydrate children based on elementType discriminator
    if (validatedRecord.children && Array.isArray(validatedRecord.children)) {
      validatedRecord.children = validatedRecord.children.map(child =>
        this.hydrateChild(child),
      );
    }

    return Object.assign(new AwspStruct(), validatedRecord);
  }

  /**
   * Serialize AwspStruct to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      ...this.serializeBaseElementFields(),
      structureType: this.structureType,
      children: this.serializeField(this.children),
    };
  }
}
