/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {TagKeyDefinitionSchema} from './tag-key-definition.schema.js';
import {BaseDefinition} from '../common/base-definition.js';

/**
 * Represents a tag key definition with identifier, name, and enumeration value.
 * Note: Parsing now uses Zod schemas. This class is kept for domain methods and database entities.
 */
export class AwspTagKeyDefinition extends BaseDefinition {
  /** Unique identifier for the tag key definition */
  id!: number;

  /** Name of the tag key definition */
  name!: string;

  /** optional enumeration value associated with the tag key definition */
  enumValue?: string;

  /**
   * Parse JSON data into AwspTagKeyDefinition instance
   * @param data - Raw JSON data
   * @returns Validated AwspTagKeyDefinition instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspTagKeyDefinition {
    const validated = TagKeyDefinitionSchema.parse(data);
    return Object.assign(new AwspTagKeyDefinition(), validated);
  }

  /**
   * Serialize AwspTagKeyDefinition to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      enumValue: this.enumValue,
    };
  }
}
