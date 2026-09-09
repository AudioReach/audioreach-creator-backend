/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Encodes a VSID into the 8-byte Subgraph property payload format.
 * The value is a little-endian UInt32 followed by 4 bytes of alignment.
 */
export function encodeVsidPayload(vsid: number): Uint8Array {
  const payload = new Uint8Array(8);
  new DataView(payload.buffer).setUint32(0, vsid, true);
  return payload;
}
