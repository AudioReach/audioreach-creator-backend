/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseModuleDefinition} from '../common/base-module-definition.js';
import {AwspDriverModuleDefinitionSchema} from './driver-module-definition.schema.js';
import {AwspParamDefinition} from '../common/param-definition.js';

/**
 * Represents a driver module definition.
 * Extends BaseModuleDefinition with driver-specific properties.
 */
export class DriverModuleDefinition extends BaseModuleDefinition {
  /** Indicates if module is stubbed (optional) */
  stubbed?: boolean;

  /**
   * Parse JSON data into DriverModuleDefinition instance
   * @param data - Raw JSON data
   * @returns Validated DriverModuleDefinition instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): DriverModuleDefinition {
    const validated = AwspDriverModuleDefinitionSchema.parse(data);

    return this.hydrateInstance(new DriverModuleDefinition(), validated, [
      {
        field: 'paramDefinitions',
        hydrator: AwspParamDefinition,
        isArray: true,
      },
    ]);
  }

  /**
   * Serialize DriverModuleDefinition to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      ...this.serializeBaseModuleFields(),
      stubbed: this.stubbed,
    };
  }
}
