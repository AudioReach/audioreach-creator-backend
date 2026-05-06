/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspPort} from './port.js';
import {AwspDataPortsInfoSchema} from './data-ports-info.schema.js';
import {BaseDefinition} from '../../common/base-definition.js';

/**
 * Represents data ports information with maximum ports and port list.
 */
export class AwspDataPortsInfo extends BaseDefinition {
  /** Maximum number of ports (required) */
  maxPortCount!: number;

  /** List of ports (required) */
  ports!: AwspPort[];

  /**
   * Parse JSON data into AwspDataPortsInfo instance
   * @param data - Raw JSON data
   * @returns Validated AwspDataPortsInfo instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspDataPortsInfo {
    const validated = AwspDataPortsInfoSchema.parse(data);
    return this.hydrateInstance(new AwspDataPortsInfo(), validated, [
      {field: 'ports', hydrator: AwspPort, isArray: true},
    ]);
  }

  /**
   * Serialize AwspDataPortsInfo to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      maxPortCount: this.maxPortCount,
      ports: this.serializeField(this.ports),
    };
  }
}
