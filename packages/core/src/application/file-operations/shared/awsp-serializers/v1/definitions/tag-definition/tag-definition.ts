/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspTagKeyDefinition} from './tag-key-definition.js';
import {TagDefinitionSchema} from './tag-definition.schema.js';
import {BaseDefinition} from '../common/base-definition.js';

/**
 * Represents a tag definition with metadata and supported keys.
 * Note: Parsing now uses Zod schemas. This class is kept for domain methods and database entities.
 */
export class AwspTagDefinition extends BaseDefinition {
  /** Unique identifier for the tag definition (required) */
  id!: number;

  /** Name of the tag definition (required) */
  name!: string;

  /** Description of the tag definition (optional) */
  description?: string;

  /** Collection of key definitions for this tag (optional) */
  keys?: AwspTagKeyDefinition[];

  /** Indicates whether this tag is voice-related (optional) */
  isVoice?: boolean;

  /** Enumeration name associated with the tag definition (optional) */
  enumName?: string;

  /** Enumeration member associated with the tag definition (optional) */
  enumMember?: string;

  /** Indicates whether this tag is an SPF tag key (optional) */
  isSPFTagKey?: boolean;

  /**
   * Parse JSON data into TagDefinition instance
   * @param data - Raw JSON data
   * @returns Validated TagDefinition instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspTagDefinition {
    const validated = TagDefinitionSchema.parse(data);
    return this.hydrateInstance(
      new AwspTagDefinition(),
      validated,
      validated.keys
        ? [
            {
              field: 'keys',
              hydrator: AwspTagKeyDefinition,
              isArray: true,
            },
          ]
        : [],
    );
  }

  static fromParsed(data: unknown): AwspTagDefinition {
    return Object.assign(new AwspTagDefinition(), data);
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
      keys: this.serializeField(this.keys),
      isVoice: this.isVoice,
      enumName: this.enumName,
      enumMember: this.enumMember,
      isSPFTagKey: this.isSPFTagKey,
    };
  }
}
