/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspIntentSchema} from './intent.schema.js';
import {BaseDefinition} from '../../common/base-definition.js';

/**
 * Represents an intent with identifier, name, and max ports.
 */
export class AwspIntent extends BaseDefinition {
  /** Intent identifier (required) */
  id!: number;

  /** Intent name (optional) */
  name?: string;

  /** Maximum number of ports (required) */
  maxports!: number;

  /**
   * Parse JSON data into AwspIntent instance
   * @param data - Raw JSON data
   * @returns Validated AwspIntent instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspIntent {
    const validated = AwspIntentSchema.parse(data);
    return Object.assign(new AwspIntent(), validated);
  }

  /**
   * Serialize AwspIntent to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      maxports: this.maxports,
    };
  }
}
