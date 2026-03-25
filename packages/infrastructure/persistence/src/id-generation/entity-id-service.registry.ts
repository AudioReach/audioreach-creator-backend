/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource, QueryRunner} from 'typeorm';
import type {IdGenerationPort} from '@arc/core';
import {EntityIdService} from './entity-id.service.js';

/**
 * Implements IdGenerationPort by managing one EntityIdService per file.
 *
 * Plain class — no NestJS decorators. The NestJS provider registration
 * (injecting DataSource and binding to ID_GENERATION_PORT) is done in
 * packages/api.
 *
 * Also exposes persistActual() which is not on the port — called directly
 * by the import/commit flow after all entity inserts succeed.
 */
export class EntityIdServiceRegistry implements IdGenerationPort {
  private readonly services = new Map<number, EntityIdService>();

  constructor(private readonly dataSource: DataSource) {}

  /** @inheritdoc */
  getNextId(fileId: number): number {
    return this.getOrCreate(fileId).getNextId();
  }

  /** @inheritdoc */
  async reserveBlock(fileId: number, blockSize?: number): Promise<number> {
    return this.getOrCreate(fileId).reserveBlock(blockSize);
  }

  /**
   * Write the actual last-used ID back to the DB for the given file,
   * reclaiming any unused tail of the reserved block.
   *
   * Not on IdGenerationPort — called directly by the import/commit flow.
   */
  async persistActual(fileId: number, queryRunner: QueryRunner): Promise<void> {
    return this.getOrCreate(fileId).persistActual(queryRunner);
  }

  private getOrCreate(fileId: number): EntityIdService {
    if (!this.services.has(fileId)) {
      this.services.set(fileId, new EntityIdService(fileId, this.dataSource));
    }
    return this.services.get(fileId)!;
  }
}
