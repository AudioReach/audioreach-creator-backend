/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspStaticControlPort} from './static-control-port.js';
import {AwspIntent} from './intent.js';
import {AwspControlPortsInfoSchema} from './control-ports-info.schema.js';
import {BaseDefinition} from '../../common/base-definition.js';

/**
 * Represents control ports information with static ports and dynamic intents.
 */
export class AwspControlPortsInfo extends BaseDefinition {
  /** List of static control ports (optional) */
  staticPorts?: AwspStaticControlPort[];

  /** List of dynamic intents (optional) */
  dynamicIntents?: AwspIntent[];

  /**
   * Parse JSON data into AwspControlPortsInfo instance
   * @param data - Raw JSON data
   * @returns Validated AwspControlPortsInfo instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspControlPortsInfo {
    const validated = AwspControlPortsInfoSchema.parse(data);

    return this.hydrateInstance(new AwspControlPortsInfo(), validated, [
      {
        field: 'staticPorts',
        hydrator: AwspStaticControlPort,
        isArray: true,
      },
      {
        field: 'dynamicIntents',
        hydrator: AwspIntent,
        isArray: true,
      },
    ]);
  }

  /**
   * Serialize AwspControlPortsInfo to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      staticPorts: this.serializeField(this.staticPorts),
      dynamicIntents: this.serializeField(this.dynamicIntents),
    };
  }
}
