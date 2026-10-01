/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryPayloadValue} from '../../../common/value-objects/binary-payload-value.js';

export class ContainerPropertyValue extends BinaryPayloadValue {
  /** System ID of the container_property_data row. */
  systemId: number;
  readonly containerPropertyDefinitionSystemId: number;

  constructor(
    containerPropertyDefinitionSystemId: number,
    payload: Uint8Array | null,
    systemId = 0,
  ) {
    super(payload);
    this.systemId = systemId;
    this.containerPropertyDefinitionSystemId =
      containerPropertyDefinitionSystemId;
  }

  getPayloadCopy(): Uint8Array | null {
    return super.getPayloadCopy();
  }

  // Add/replace payload using defensive copy semantics
  setPayloadCopy(value: Uint8Array | null): void {
    this.setPayloadCopyInternal(value);
  }
}
