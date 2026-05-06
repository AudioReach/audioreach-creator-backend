/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {AwspDefinitionElement} from '../common/element-types.js';
import {BaseDefinition} from '../common/base-definition.js';

/**
 * Represents a base property definition with core identification and elements.
 * Note: Parsing now uses Zod schemas. This class is kept for domain methods and database entities.
 */
export abstract class BasePropertyDefinition extends BaseDefinition {
  /** Unique identifier for the property definition (required) */
  id!: number;

  /** Name of the property definition (required) */
  name!: string;

  /** Description of the property definition (optional) */
  description?: string;

  /** Maximum size for the property (optional) */
  maxSize?: number;

  /** List of element associated with this property (required) */
  elements!: AwspDefinitionElement[];

  /**
   * Helper method for subclasses to serialize base property fields
   * @returns Base property fields as plain object
   */
  protected serializeBasePropertyFields(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      maxSize: this.maxSize,
      elements: this.serializeField(this.elements),
    };
  }
}
