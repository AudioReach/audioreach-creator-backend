/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspValueDefinition} from './value-definition.js';
import type {SpecialKey} from './type/special-key-type.js';
import {KeyDefinitionSchema} from './key-definition.schema.js';
import {BaseDefinition} from '../common/base-definition.js';

/**
 * Represents a key definition with identifier, name, and associated values.
 * Note: Parsing now uses Zod schemas. This class is kept for domain methods and database entities.
 */
export class AwspKeyDefinition extends BaseDefinition {
  /** Unique identifier for the key definition */
  id!: number;

  /** Name of the key definition */
  name!: string;

  /** List of value definitions associated with this key */
  values!: AwspValueDefinition[];

  /** Optional description providing additional details about the key definition */
  description?: string;

  /** Optional flag indicating if this is a voice key */
  isVoice?: boolean;

  /** Optional flag indicating if this is a dynamic key */
  isDynamic?: boolean;

  /** Special key type classification */
  specialty?: SpecialKey;

  /** Optional enumeration member associated with the key definition */
  enumMember?: string;

  /** Optional enumeration name associated with the key definition */
  enumName?: string;

  /** Optional flag indicating if this is a graph key */
  isGraphKey?: boolean;

  /** Optional graph key enumeration member */
  graphKeyEnumMember?: string;

  /** Optional flag indicating if this is a calibration key */
  isCalKey?: boolean;

  /** Optional calibration key enumeration member */
  calKeyEnumMember?: string;

  /** Optional flag indicating if this key is an SPF key */
  isSpfKey?: boolean;

  /**
   * Parse JSON data into AwspKeyDefinition instance
   * @param data - Raw JSON data
   * @returns Validated AwspKeyDefinition instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspKeyDefinition {
    const validated = KeyDefinitionSchema.parse(data);
    return this.hydrateInstance(new AwspKeyDefinition(), validated, [
      {field: 'values', hydrator: AwspValueDefinition, isArray: true},
    ]);
  }

  static fromParsed(data: unknown): AwspKeyDefinition {
    return Object.assign(new AwspKeyDefinition(), data);
  }

  /**
   * Serialize AwspKeyDefinition to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      values: this.serializeField(this.values),
      description: this.description,
      isVoice: this.isVoice,
      isDynamic: this.isDynamic,
      specialty: this.specialty,
      enumMember: this.enumMember,
      enumName: this.enumName,
      isGraphKey: this.isGraphKey,
      graphKeyEnumMember: this.graphKeyEnumMember,
      isCalKey: this.isCalKey,
      calKeyEnumMember: this.calKeyEnumMember,
      isSpfKey: this.isSpfKey,
    };
  }
}
