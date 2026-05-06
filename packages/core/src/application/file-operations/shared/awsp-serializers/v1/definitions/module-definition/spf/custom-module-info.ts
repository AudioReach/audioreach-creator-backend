/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspCustomModuleInfoSchema} from './custom-module-info.schema.js';
import {BaseDefinition} from '../../common/base-definition.js';

/**
 * Represents custom module information.
 */
export class AwspCustomModuleInfo extends BaseDefinition {
  /** Major type identifier (required) */
  majorTypeID!: number;

  /** Interface type identifier (required) */
  interfaceTypeID!: number;

  /** Interface version identifier (required) */
  interfaceVersionID!: number;

  /** File name (required) */
  fileName!: string;

  /** Entry point tag (required) */
  entryPointTag!: string;

  /**
   * Parse JSON data into AwspCustomModuleInfo instance
   * @param data - Raw JSON data
   * @returns Validated AwspCustomModuleInfo instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspCustomModuleInfo {
    const validated = AwspCustomModuleInfoSchema.parse(data);
    return Object.assign(new AwspCustomModuleInfo(), validated);
  }

  /**
   * Serialize AwspCustomModuleInfo to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      majorTypeID: this.majorTypeID,
      interfaceTypeID: this.interfaceTypeID,
      interfaceVersionID: this.interfaceVersionID,
      fileName: this.fileName,
      entryPointTag: this.entryPointTag,
    };
  }
}
