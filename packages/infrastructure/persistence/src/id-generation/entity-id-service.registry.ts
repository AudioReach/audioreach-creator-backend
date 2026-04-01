/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {IdGenerationPort} from '@arc/core';
import {EntityIdService} from './entity-id.service.js';

/**
 * Implements IdGenerationPort by managing one EntityIdService per file.
 *
 * Plain class — no NestJS decorators. The NestJS provider registration
 * (injecting DataSource and binding to ID_GENERATION_PORT) is done in
 * packages/api.
 */
export class EntityIdServiceRegistry implements IdGenerationPort {
  private readonly services = new Map<number, EntityIdService>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly autoReserveSize?: number,
  ) {}

  /** @inheritdoc */
  async getNextId(fileId: number): Promise<number> {
    return this.getOrCreate(fileId).getNextId();
  }

  /** @inheritdoc */
  async reserveBlock(fileId: number, blockSize?: number): Promise<number> {
    return this.getOrCreate(fileId).reserveBlock(blockSize);
  }

  /** @inheritdoc */
  async persistLastUsedId(fileId: number): Promise<void> {
    return this.getOrCreate(fileId).persistLastUsedId();
  }

  private getOrCreate(fileId: number): EntityIdService {
    if (!this.services.has(fileId)) {
      this.services.set(
        fileId,
        new EntityIdService(fileId, this.dataSource, this.autoReserveSize),
      );
    }
    return this.services.get(fileId)!;
  }
}
