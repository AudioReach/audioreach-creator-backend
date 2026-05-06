/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ProcessorDefinitionSchema} from './processor-definition.schema.js';
import {BaseDefinition} from '../common/base-definition.js';

/**
 * Represents a processor definition with basic processor information.
 * Note: Parsing now uses Zod schemas. This class is kept for domain methods and database entities.
 */
export class ProcessorDefinition extends BaseDefinition {
  /** Processor identifier (required) */
  id!: number;

  /** Processor name (required) */
  name!: string;

  /**
   * Parse JSON data into ProcessorDefinition instance
   * @param data - Raw JSON data
   * @returns Validated ProcessorDefinition instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): ProcessorDefinition {
    const validated = ProcessorDefinitionSchema.parse(data);
    return Object.assign(new ProcessorDefinition(), validated);
  }

  /**
   * Serialize ProcessorDefinition to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
    };
  }
}
