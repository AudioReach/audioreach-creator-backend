/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BasePropertyDefinition} from './base-property-definition.js';
import {DriverPropertyDefinitionSchema} from './driver-property-definition.schema.js';

/**
 * Represents a driver property definition.
 * Inherits all properties from BasePropertyDefinition without additional properties.
 * Driver properties don't have category information.
 */
export class DriverPropertyDefinition extends BasePropertyDefinition {
  /**
   * Parse JSON data into DriverPropertyDefinition instance
   * @param data - Raw JSON data
   * @returns Validated DriverPropertyDefinition instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): DriverPropertyDefinition {
    const validated = DriverPropertyDefinitionSchema.parse(data);
    return Object.assign(new DriverPropertyDefinition(), validated);
  }

  /**
   * Serialize DriverPropertyDefinition to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return this.serializeBasePropertyFields();
  }
}
