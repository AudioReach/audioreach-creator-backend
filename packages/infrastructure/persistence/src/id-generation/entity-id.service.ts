/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import {LessThanOrEqual} from 'typeorm';
import {FILE_ID_MODULUS} from './composite-id.js';
import {ArcDbFileSchema} from '../persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';

/**
 * Per-file in-memory ID block manager.
 *
 *   reserveBlock()  — runs in its own DataSource transaction, committed
 *                     immediately before any entity rows are written.
 *                     Crash-safe: reserved IDs are persisted upfront and
 *                     will never be reissued even if the import fails.
 *                     Call explicitly for bulk operations (e.g. open-file)
 *                     to pre-reserve a large block and avoid repeated
 *                     auto-reserve DB calls.
 *
 *   getNextId()     — async; hands out IDs from the in-memory block.
 *                     Transparently auto-reserves a new block (autoReserveSize
 *                     IDs, default 100) when the current block is exhausted or
 *                     no block has been reserved yet.
 *                     Concurrent calls that arrive while a reserve is in-flight
 *                     are coalesced onto the same DB round-trip.
 *
 *   persistActual() — writes the actual last-used ID back to the DB,
 *                     reclaiming any unused tail of the reserved block.
 */
export class EntityIdService {
  private current = 0;
  private blockEnd = 0;
  private pendingReserve: Promise<number> | null = null;

  constructor(
    private readonly fileId: number,
    private readonly dataSource: DataSource,
    private readonly autoReserveSize: number = 100,
  ) {}

  /**
   * Return the next composite ID for this file.
   * Async — auto-reserves a new block when the current block is exhausted.
   * Concurrent callers that arrive while a reserve is in-flight await the
   * same promise (coalesced), preventing redundant DB round-trips.
   */
  async getNextId(): Promise<number> {
    // Loop handles the case where more concurrent callers than autoReserveSize
    // are all waiting: after the first reserve fills up, the overflow callers
    // re-enter the loop and trigger a second reserve.
    while (this.current >= this.blockEnd) {
      if (!this.pendingReserve) {
        // Only one DB call fires; all concurrent callers await the same promise.
        // .finally runs before any awaiting continuation resumes, so
        // pendingReserve is null by the time any caller checks it again.
        this.pendingReserve = this.reserveBlock(this.autoReserveSize).finally(
          () => {
            this.pendingReserve = null;
          },
        );
      }
      await this.pendingReserve;
    }
    this.current += FILE_ID_MODULUS;
    return this.current + this.fileId;
  }

  /**
   * Atomically reserve a block of IDs in a dedicated transaction.
   * Committed immediately — independent of the caller's connection.
   *
   * @param blockSize Number of IDs to reserve (default autoReserveSize).
   * @returns First ID in the reserved block.
   */
  async reserveBlock(blockSize = this.autoReserveSize): Promise<number> {
    const increment = blockSize * FILE_ID_MODULUS;

    const newHighWaterMark = await this.dataSource.transaction(async em => {
      await em.increment(
        ArcDbFileSchema,
        {systemId: this.fileId},
        'lastReservedId',
        increment,
      );
      const row = await em.findOne(ArcDbFileSchema, {
        where: {systemId: this.fileId},
      });
      return row!.lastReservedId;
    });

    this.blockEnd = newHighWaterMark;
    this.current = newHighWaterMark - increment;
    return this.current + FILE_ID_MODULUS + this.fileId; // first ID in block
  }

  /**
   * Write the actual last-used ID back to the DB, reclaiming any unused
   * tail of the reserved block.
   *
   * Uses DataSource directly — no QueryRunner required.
   * The conditional WHERE guard (last_reserved_id <= blockEnd) prevents
   * going backwards if a concurrent request has already advanced the
   * watermark beyond our reserved block.
   */
  async persistLastUsedId(): Promise<void> {
    await this.dataSource.manager.update(
      ArcDbFileSchema,
      {systemId: this.fileId, lastReservedId: LessThanOrEqual(this.blockEnd)},
      {lastReservedId: this.current},
    );
  }
}
