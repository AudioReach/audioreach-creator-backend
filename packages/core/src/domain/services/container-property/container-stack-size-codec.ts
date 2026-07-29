/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Encodes a numeric stack size value into the 4-byte little-endian blob
 * format stored in container_property_data.payload.
 */
export function encodeStackSize(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  new DataView(buf.buffer).setUint32(0, value >>> 0, true);
  return buf;
}

/**
 * Decodes a container stack size blob back to a number.
 * Returns 0 when the buffer is too short or empty.
 */
export function decodeStackSize(data: Uint8Array): number {
  if (data.length < 4) return 0;
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(
    0,
    true,
  );
}
