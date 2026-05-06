/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BasePropertyDefinition} from './base-property-definition.js';
import {SpfPropertyDefinitionSchema} from './spf-property-definition.schema.js';

/**
 * Represents an SPF property definition with category and module instance information.
 * Extends BasePropertyDefinition with additional SPF-specific properties.
 * Note: Parsing now uses Zod schemas. This class is kept for domain methods and database entities.
 */
export class SpfPropertyDefinition extends BasePropertyDefinition {
  /** Category identifier for the SPF property (required) */
  categoryId!: number;

  /** Category name for the SPF property (required) */
  categoryName!: string;

  /** APM module instance identifier (required) */
  apmModuleInstanceId!: number;

  /** Indicates whether this property is voice-related (optional) */
  isVoice?: boolean;

  /**
   * Parse JSON data into SpfPropertyDefinition instance
   * @param data - Raw JSON data
   * @returns Validated SpfPropertyDefinition instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): SpfPropertyDefinition {
    const validated = SpfPropertyDefinitionSchema.parse(data);
    return Object.assign(new SpfPropertyDefinition(), validated);
  }

  /**
   * Serialize SpfPropertyDefinition to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      ...this.serializeBasePropertyFields(),
      categoryId: this.categoryId,
      categoryName: this.categoryName,
      apmModuleInstanceId: this.apmModuleInstanceId,
      isVoice: this.isVoice,
    };
  }
}
