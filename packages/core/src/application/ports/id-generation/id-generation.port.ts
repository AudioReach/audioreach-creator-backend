/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface IdGenerationPort {
  /**
   * Returns the next composite ID for an entity in the given file.
   * Async — transparently auto-reserves a new block (default 100 IDs) when
   * the current in-memory block is exhausted or no block has been reserved yet.
   * Concurrent calls that arrive while a reserve is in-flight are coalesced
   * onto the same DB round-trip.
   *
   * Call reserveBlock() upfront for bulk operations (e.g. open-file) to
   * pre-reserve a large block and avoid repeated auto-reserve DB calls.
   */
  getNextId(fileId: number): Promise<number>;

  /**
   * Explicitly reserves a contiguous block of IDs for a file.
   * Atomically increments last_reserved_id in the DB — crash-safe.
   * Call once before bulk import or session creation begins to pre-reserve
   * a large block (e.g. 1_000_000 for open-file).
   *
   * @returns First ID in the reserved block.
   */
  reserveBlock(fileId: number, blockSize?: number): Promise<number>;

  /**
   * Writes the actual last-used ID back to the DB, reclaiming any unused
   * tail of the reserved block.
   *
   * Call after all entity inserts for a workflow phase succeed (e.g. after
   * commit-changes or end-session) to keep last_reserved_id tight.
   */
  persistLastUsedId(fileId: number): Promise<void>;
}
