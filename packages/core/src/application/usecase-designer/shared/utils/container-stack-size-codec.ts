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

/**
 * Decodes a CAPABILITY_LIST property blob into an array of ContainerType domain values.
 * Blob format: [count uint32 LE, val0 uint32 LE, val1 uint32 LE, ...]
 * Returns empty array when the blob is missing or malformed.
 */
export function decodeCapabilityList(
  blob: Uint8Array | null | undefined,
): number[] {
  if (!blob || blob.byteLength < 4) return [];
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const count = view.getUint32(0, true);
  const ids: number[] = [];
  for (let i = 0; i < count && (i + 1) * 4 + 4 <= blob.byteLength; i++) {
    ids.push(view.getUint32((i + 1) * 4, true));
  }
  return ids;
}
