/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

/**
 * Parsed driver-section properties for a single subgraph.
 * Symmetric counterpart to SpfProperties — both are parsed at chunk-parse time
 * from the same DATAPOOL payload and stored together on SubgraphDataEntry.
 *
 * Binary layout decoded: [SubgraphId u32][NumProps u32]([PropId u32][Len u32][Data …])*
 */
export class DriverProperties {
  /** Map of driver property ID to raw property payload */
  readonly properties: Map<number, Uint8Array>;

  constructor(properties: Map<number, Uint8Array>) {
    this.properties = properties;
  }

  static fromPayload(payload: Uint8Array): DriverProperties {
    if (payload.length === 0) {
      return new DriverProperties(new Map());
    }
    const view = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    let pos = 0;
    pos += BinaryUtils.SIZEOF_UINT32; // skip subgraphId
    const numProperties = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    const properties = new Map<number, Uint8Array>();
    for (let i = 0; i < numProperties; i++) {
      const propertyId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;
      const length = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;
      properties.set(propertyId, payload.slice(pos, pos + length));
      pos += length;
    }
    return new DriverProperties(properties);
  }
}
