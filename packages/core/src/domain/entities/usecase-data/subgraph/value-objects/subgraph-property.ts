/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryPayloadValue} from '../../../common/value-objects/binary-payload-value.js';

export class SubgraphPropertyData extends BinaryPayloadValue {
  readonly propertyDefinitionSystemId: number;

  constructor(propertyDefinitionSystemId: number, payload: Uint8Array | null) {
    super(payload);
    this.propertyDefinitionSystemId = propertyDefinitionSystemId;
  }

  getPayloadCopy(): Uint8Array | null {
    return super.getPayloadCopy();
  }

  // Add/replace payload using defensive copy semantics
  setPayloadCopy(value: Uint8Array | null): void {
    this.setPayloadCopyInternal(value);
  }
}
