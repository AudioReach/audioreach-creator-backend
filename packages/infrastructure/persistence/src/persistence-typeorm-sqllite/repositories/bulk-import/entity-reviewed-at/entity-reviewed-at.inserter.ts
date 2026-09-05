/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {
  type BulkInsertResult,
  type EntityReviewedAt,
  okBulkInsert,
  errBulkInsert,
} from '@arc/core';
import {EntityReviewedAtSchema} from '../../../entity-schema/usecase-data/entity-reviewed-at.schema.js';

export class EntityReviewedAtInserter {
  constructor(private readonly manager: EntityManager) {}

  async insert(items: readonly EntityReviewedAt[]): Promise<BulkInsertResult> {
    if (items.length === 0) return okBulkInsert();

    const errors: {systemId: number; message: string; details: string}[] = [];

    for (const item of items) {
      try {
        await this.manager.insert(EntityReviewedAtSchema, {
          fileSystemId: item.fileSystemId,
          entityType: item.entityType,
          entitySystemId: item.entitySystemId,
          reviewedAt: item.reviewedAt,
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push({
          systemId: item.entitySystemId,
          message: `Failed to insert reviewed-at for ${item.entityType}:${item.entitySystemId}`,
          details: msg,
        });
      }
    }

    return errors.length === 0 ? okBulkInsert() : errBulkInsert(errors);
  }
}
