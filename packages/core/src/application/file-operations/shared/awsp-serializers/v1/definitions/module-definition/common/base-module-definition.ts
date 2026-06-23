/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspParamDefinition} from './param-definition.js';
import {BaseDefinition} from '../../common/base-definition.js';

/**
 * Abstract base class for module definitions.
 * Contains common properties shared between SPF and Driver module definitions.
 */
export abstract class BaseModuleDefinition extends BaseDefinition {
  /** Module identifier (required) */
  id!: number;

  /** Module name (required) */
  name!: string;

  /** List of parameter definitions (optional) */
  parameters?: AwspParamDefinition[];

  /** Display name (optional) */
  displayName?: string;

  /** Module description (optional) */
  description?: string;

  /** ID of module that replaces this one (optional) */
  replacedBy?: number;

  /** Indicates if module is deprecated (optional) */
  deprecated?: boolean;

  /**
   * Helper method for subclasses to serialize base module fields
   * @returns Base module fields as plain object
   */
  protected serializeBaseModuleFields(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      parameters: this.serializeField(this.parameters),
      displayName: this.displayName,
      description: this.description,
      replacedBy: this.replacedBy,
      deprecated: this.deprecated,
    };
  }
}
