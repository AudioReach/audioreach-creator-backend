/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {TagKeyDefinition} from './tag-key-definition.js';
import {TagDefinitionSchema} from './tag-definition.schema.js';
import {BaseDefinition} from '../common/base-definition.js';

/**
 * Represents a tag definition with metadata and supported keys.
 * Note: Parsing now uses Zod schemas. This class is kept for domain methods and database entities.
 */
export class TagDefinition extends BaseDefinition {
  /** Unique identifier for the tag definition (required) */
  id!: number;

  /** Name of the tag definition (required) */
  name!: string;

  /** Description of the tag definition (optional) */
  description?: string;

  /** Collection of supported key definitions for this tag (optional) */
  supportedKeys?: TagKeyDefinition[];

  /** Indicates whether this tag is voice-related (optional) */
  isVoice?: boolean;

  /** Enumeration name associated with the tag definition (optional) */
  enumName?: string;

  /** Enumeration value associated with the tag definition (optional) */
  enumValue?: string;

  /**
   * Parse JSON data into TagDefinition instance
   * @param data - Raw JSON data
   * @returns Validated TagDefinition instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): TagDefinition {
    const validated = TagDefinitionSchema.parse(data);
    return this.hydrateInstance(
      new TagDefinition(),
      validated,
      validated.supportedKeys
        ? [{field: 'supportedKeys', hydrator: TagKeyDefinition, isArray: true}]
        : [],
    );
  }

  /**
   * Serialize TagDefinition to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      supportedKeys: this.serializeField(this.supportedKeys),
      isVoice: this.isVoice,
      enumName: this.enumName,
      enumValue: this.enumValue,
    };
  }
}
