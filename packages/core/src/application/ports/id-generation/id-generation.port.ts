/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface IdGenerationPort {
  /**
   * Returns the next composite ID for an entity in the given file.
   * Pure in-memory — no DB call.
   * Must be called after reserveBlock() has been called for this fileId.
   */
  getNextId(fileId: number): number;

  /**
   * Reserves a contiguous block of IDs for a session.
   * Atomically increments last_entity_id in the DB — crash-safe.
   * Call once before bulk import or session creation begins.
   *
   * @returns First ID in the reserved block.
   */
  reserveBlock(fileId: number, blockSize?: number): Promise<number>;
}
