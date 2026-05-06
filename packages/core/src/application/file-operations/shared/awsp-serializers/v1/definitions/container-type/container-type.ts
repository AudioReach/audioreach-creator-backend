/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ContainerTypeSchema} from './container-type.schema.js';
import {BaseDefinition} from '../common/base-definition.js';

/**
 * Represents a container type with basic container type information.
 * Note: Parsing now uses Zod schemas. This class is kept for domain methods and database entities.
 */
export class ContainerType extends BaseDefinition {
  /** Container type identifier (required) */
  id!: number;

  /** Container type name (required) */
  name!: string;

  /**
   * Parse JSON data into ContainerType instance
   * @param data - Raw JSON data
   * @returns Validated ContainerType instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): ContainerType {
    const validated = ContainerTypeSchema.parse(data);
    return Object.assign(new ContainerType(), validated);
  }

  /**
   * Serialize ContainerType to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
    };
  }
}
