/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspPortSchema} from './port.schema.js';
import {BaseDefinition} from '../../common/base-definition.js';

/**
 * Represents a port with identifier and name.
 */
export class AwspPort extends BaseDefinition {
  /** Port identifier (required) */
  id!: number;

  /** Port name (optional) */
  name?: string;

  /**
   * Parse JSON data into AwspPort instance
   * @param data - Raw JSON data
   * @returns Validated AwspPort instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspPort {
    const validated = AwspPortSchema.parse(data);
    return Object.assign(new AwspPort(), validated);
  }

  /**
   * Serialize AwspPort to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
    };
  }
}
