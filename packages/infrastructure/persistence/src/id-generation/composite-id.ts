/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Number of bits reserved for the file ID in a composite entity ID.
 *
 * Bit layout (53-bit integer, fits in Number.MAX_SAFE_INTEGER):
 *   Upper 30 bits — per-file sequence counter
 *   Lower 23 bits — files.system_id (fileId)
 *
 * compositeId = seq * FILE_ID_MODULUS + fileId
 */
export const FILE_ID_BITS = 23;

/**
 * Multiplier used to encode the sequence counter into the upper bits.
 * Equals 2^23 = 8_388_608.
 */
export const FILE_ID_MODULUS = 2 ** FILE_ID_BITS;

/** Maximum valid file ID (2^23 - 1 = 8_388_607). */
export const MAX_FILE_ID = FILE_ID_MODULUS - 1;

/** Maximum valid per-file sequence number (2^30 - 1 = 1_073_741_823). */
export const MAX_SEQ = 2 ** 30 - 1;

/**
 * Build a composite entity ID from a file ID and a per-file sequence
 * number. Uses multiplication — JS bitwise operators are 32-bit only.
 *
 * @param fileId  files.system_id  (1 … 8_388_607)
 * @param seq     Per-file entity counter  (1 … 1_073_741_823)
 * @throws RangeError if either input is out of range or the result
 *         exceeds Number.MAX_SAFE_INTEGER.
 */
export function makeCompositeId(fileId: number, seq: number): number {
  if (!Number.isInteger(fileId) || fileId <= 0 || fileId > MAX_FILE_ID) {
    throw new RangeError(`fileId out of range: ${fileId}`);
  }
  if (!Number.isInteger(seq) || seq <= 0 || seq > MAX_SEQ) {
    throw new RangeError(`seq out of range: ${seq}`);
  }
  const id = seq * FILE_ID_MODULUS + fileId;
  if (!Number.isSafeInteger(id)) {
    throw new RangeError(`compositeId exceeds MAX_SAFE_INTEGER: ${id}`);
  }
  return id;
}
