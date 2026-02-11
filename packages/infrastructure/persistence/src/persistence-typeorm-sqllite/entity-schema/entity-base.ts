/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntitySchemaColumnOptions} from 'typeorm';

export interface EntityBaseRow {
  // arc specific id, should be treated as primary key for the entity whenever possible
  systemId: number;
  // stores the entity creation date
  creationDate: Date;
  // stores entity update date
  updateDate: Date;
  // version for optimistic locking
  version: number;
}

/**
 * Utility type to omit auto-generated/managed fields from entity rows.
 * Use this when creating new entity rows to insert into the database.
 *
 * Auto-managed fields:
 * - systemId: Auto-incremented by database
 * - creationDate: Set by TypeORM on insert
 * - updateDate: Set by TypeORM on update
 * - version: Managed by TypeORM for optimistic locking
 *
 * @example
 * ```typescript
 * function toProjectRow(entity: Project): EntityRowForInsert<ProjectRow> {
 *   return {
 *     name: entity.name,
 *     description: entity.description,
 *     type: entity.type,
 *   };
 * }
 * ```
 */
export type EntityRowForInsert<T extends EntityBaseRow> = Omit<
  T,
  'systemId' | 'creationDate' | 'updateDate' | 'version'
>;

export const BaseColumnSchemaPart: Record<string, EntitySchemaColumnOptions> = {
  systemId: {
    name: 'system_id',
    type: 'integer',
    primary: true,
    generated: 'increment',
  },

  creationDate: {
    name: 'created_at',
    type: 'datetime',
    createDate: true,
  },

  updateDate: {
    name: 'updated_at',
    type: 'datetime',
    updateDate: true,
  },

  version: {
    name: 'version',
    type: 'integer',
    version: true,
    default: 1,
  },
};
