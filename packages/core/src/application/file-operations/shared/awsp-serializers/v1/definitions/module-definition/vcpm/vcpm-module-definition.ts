/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseModuleDefinition} from '../common/base-module-definition.js';
import {AwspVcpmModuleDefinitionSchema} from './vcpm-module-definition.schema.js';
import {AwspParamDefinition} from '../common/param-definition.js';

/**
 * Represents a VCPM module definition.
 * Extends BaseModuleDefinition with no additional VCPM-specific properties.
 */
export class AwspVcpmModuleDefinition extends BaseModuleDefinition {
  /**
   * Parse JSON data into AwspVcpmModuleDefinition instance
   * @param data - Raw JSON data
   * @returns Validated AwspVcpmModuleDefinition instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspVcpmModuleDefinition {
    const validated = AwspVcpmModuleDefinitionSchema.parse(data);

    return this.hydrateInstance(new AwspVcpmModuleDefinition(), validated, [
      {
        field: 'paramDefinitions',
        hydrator: AwspParamDefinition,
        isArray: true,
      },
    ]);
  }

  /**
   * Serialize AwspVcpmModuleDefinition to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      ...this.serializeBaseModuleFields(),
    };
  }
}
