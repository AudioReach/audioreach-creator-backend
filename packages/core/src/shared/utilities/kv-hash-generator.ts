/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createHash} from 'node:crypto';

/**
 * Utility for generating deterministic hashes for KeyVectors.
 * Used for deduplication of KeyVectors based on their value system IDs.
 */
export const KvHashGenerator = {
  /**
   * Generate deterministic SHA-256 hash from value system IDs.
   *
   * IMPORTANT: The order of valueSystemIds is preserved during hashing.
   * This means [A, B] and [B, A] will produce DIFFERENT hashes, which is
   * correct since valueSystemIds represents an ordered list of key→value
   * mappings where position carries semantic meaning.
   *
   * @param valueSystemIds Array of value system IDs (order matters)
   * @returns SHA-256 hash string (64 characters)
   */
  generateHash(valueSystemIds: number[]): string {
    // Create hash input string directly from the ordered array
    // Do NOT sort - order matters for key→value mappings
    const hashInput = valueSystemIds.join(',');

    // Generate SHA-256 hash
    return createHash('sha256').update(hashInput).digest('hex');
  },
};
