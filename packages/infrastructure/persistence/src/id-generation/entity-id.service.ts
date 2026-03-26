/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import {LessThanOrEqual} from 'typeorm';
import {FILE_ID_MODULUS} from './composite-id.js';
import {ArcDbFileSchema} from '../persistence-typeorm-sqllite/entity-schema/project-data/arc-db-file.schema.js';

/**
 * Per-file in-memory ID block manager.
 *
 * Two-phase design matching the upload-file workflow:
 *
 *   reserveBlock()  — runs in its own DataSource transaction, committed
 *                     immediately before any entity rows are written.
 *                     Crash-safe: reserved IDs are persisted upfront and
 *                     will never be reissued even if the import fails.
 *
 *   getNextId()     — synchronous; hands out IDs from the in-memory block.
 *                     No DB call.
 *
 *   persistActual() — runs as a standalone query on the caller's QueryRunner
 *                     after all entity inserts succeed. Reclaims any unused
 *                     tail of the reserved block.
 *
 * Not a NestJS injectable — owned and created by EntityIdServiceRegistry.
 */
export class EntityIdService {
  private current = 0;
  private blockEnd = 0;
  private initialized = false;

  constructor(
    private readonly fileId: number,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Return the next composite ID for this file.
   * Synchronous — no DB call. Must call reserveBlock() first.
   */
  getNextId(): number {
    if (!this.initialized) {
      throw new Error(
        `EntityIdService for file ${this.fileId} not initialized. ` +
          `Call reserveBlock() before getNextId().`,
      );
    }
    if (this.current >= this.blockEnd) {
      throw new Error(
        `ID block exhausted for file ${this.fileId}. ` +
          `Call reserveBlock() again to reserve more IDs.`,
      );
    }
    this.current += FILE_ID_MODULUS;
    return this.current;
  }

  /**
   * Atomically reserve a block of IDs in a dedicated transaction.
   * Committed immediately — independent of the caller's connection.
   *
   * @param blockSize Number of IDs to reserve (default 1000).
   * @returns First ID in the reserved block.
   */
  async reserveBlock(blockSize = 10): Promise<number> {
    const increment = blockSize * FILE_ID_MODULUS;

    const newHighWaterMark = await this.dataSource.transaction(async em => {
      await em.increment(
        ArcDbFileSchema,
        {systemId: this.fileId},
        'lastEntityId',
        increment,
      );
      const row = await em.findOne(ArcDbFileSchema, {
        where: {systemId: this.fileId},
      });
      return row!.lastEntityId;
    });

    this.blockEnd = newHighWaterMark;
    this.current = newHighWaterMark - increment;
    this.initialized = true;

    return this.current + FILE_ID_MODULUS; // first ID in block
  }

  /**
   * Write the actual last-used ID back to the DB, reclaiming any
   * unused tail of the reserved block.
   *
   * Runs as a standalone query on the caller's QueryRunner (Phase 2
   * of the upload-file workflow has no wrapping transaction).
   */
  async persistActual(queryRunner: QueryRunner): Promise<void> {
    // Only reclaim if no concurrent request has advanced the watermark
    // beyond our reserved block. If last_entity_id > blockEnd, another
    // request owns those IDs and we must not go backwards.
    await queryRunner.manager.update(
      ArcDbFileSchema,
      {systemId: this.fileId, lastEntityId: LessThanOrEqual(this.blockEnd)},
      {lastEntityId: this.current},
    );
  }
}
