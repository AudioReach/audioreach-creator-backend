/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {AwspPort} from './port.js';
import {AwspIntent} from './intent.js';
import {AwspStaticControlPortSchema} from './static-control-port.schema.js';

/**
 * Represents a static control port with supported intents.
 * Extends Port with intent support.
 */
export class AwspStaticControlPort extends AwspPort {
  /** List of supported intents (required) */
  intents!: AwspIntent[];

  /**
   * Parse JSON data into AwspStaticControlPort instance
   * @param data - Raw JSON data
   * @returns Validated AwspStaticControlPort instance
   * @throws ZodError if validation fails
   */
  static fromJSON(data: unknown): AwspStaticControlPort {
    const validated = AwspStaticControlPortSchema.parse(data);
    return Object.assign(new AwspStaticControlPort(), validated);
  }

  /**
   * Serialize AwspStaticControlPort to JSON
   * @returns Plain object suitable for JSON serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      intents: this.serializeField(this.intents),
    };
  }
}
