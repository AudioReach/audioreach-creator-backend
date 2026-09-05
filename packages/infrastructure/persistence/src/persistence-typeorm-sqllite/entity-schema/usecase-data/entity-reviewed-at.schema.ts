/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import type {ReviewedAtEntityType} from '@arc/core';
import type {ArcDbFileRow} from '../project-data/arc-db-file.schema.js';

export interface EntityReviewedAtBase {
  id: number;
  fileSystemId: number;
  entityType: ReviewedAtEntityType;
  entitySystemId: number;
  reviewedAt: string;
}

export interface EntityReviewedAtRow extends EntityReviewedAtBase {
  file?: ArcDbFileRow;
}

export const EntityReviewedAtSchema = new EntitySchema<EntityReviewedAtRow>({
  name: 'EntityReviewedAt',
  tableName: 'entity_reviewed_at',
  columns: {
    id: {name: 'id', type: 'integer', primary: true, generated: 'increment'},
    fileSystemId: {name: 'file_system_id', type: 'integer', nullable: false},
    entityType: {
      name: 'entity_type',
      type: 'varchar',
      length: 20,
      nullable: false,
    },
    entitySystemId: {
      name: 'entity_system_id',
      type: 'integer',
      nullable: false,
    },
    reviewedAt: {
      name: 'reviewed_at',
      type: 'varchar',
      length: 100,
      nullable: false,
    },
  },
  relations: {
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {name: 'file_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE',
    },
  },
  indices: [
    {
      name: 'uk_entity_reviewed_at',
      columns: ['fileSystemId', 'entityType', 'entitySystemId'],
      unique: true,
    },
  ],
});
