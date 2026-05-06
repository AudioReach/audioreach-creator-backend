/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ValueDefinitionSchema} from './value-definition.schema.js';
import {BaseDefinition} from '../common/base-definition.js';

/**
 * Represents a value definition with identifier and name properties.
 * Note: Parsing now uses Zod schemas. This class is kept for domain methods and database entities.
 */
export class AwspValueDefinition extends BaseDefinition {
  /** Unique identifier for the value definition */
  id!: number;

  /** Name of the value definition */
  name!: string;

  /** Optional description providing additional details about the value definition */
  description?: string;

  /** Optional enumeration value associated with the value definition */
  enumValue?: string;

  /** Optional special value that should be filled when SpecialKey exists in the parent KeyDefinition */
  specialValue?: string;

  /**
   * Parse JSON data into AwspValueDefinition instance
   * @param data - Raw JSON data
   * @returns Validated AwspValueDefinition instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspValueDefinition {
    const validated = ValueDefinitionSchema.parse(data);
    return Object.assign(new AwspValueDefinition(), validated);
  }

  /**
   * Serialize AwspValueDefinition to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      enumValue: this.enumValue,
      specialValue: this.specialValue,
    };
  }
}
