/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
import type {SpfModuleRow} from '../module/spf-module.schema.js';
import type {VcpmInstanceRow} from './subgraph-vcpm-data.js';
import type {SgkvRow} from './subgraph-sgkv-data.js';
import {EntitySchema} from 'typeorm';

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface SubgraphBase {
  systemId: number;
  subgraphId: number;
  name: string;
  isImported: boolean;
  fileSystemId: number;
}

export interface SubgraphRow extends EntityBaseRow, SubgraphBase {
  // true: if subgraph is exported from another acdb file — kept on Row, not Base
  // inverse relation for convenience (reads/cascade)
  modules?: SpfModuleRow[];
  vcpmInstances?: VcpmInstanceRow[];
  sgkvs?: SgkvRow[];
  file?: ArcDbFileRow;
}

export const SubgraphSchema = new EntitySchema<SubgraphRow>({
  name: 'Subgraph',
  tableName: 'subgraphs',
  columns: {
    ...BaseColumnSchemaPart,
    name: {type: 'varchar', length: 256},
    subgraphId: {name: 'subgraph_id', type: 'integer'},
    isImported: {name: 'is_exported', type: 'integer'}, // SQLite stores boolean as 0/1
    fileSystemId: {name: 'file_system_id', type: 'integer'},
  },
  relations: {
    // Inverse for convenience.
    modules: {
      type: 'one-to-many',
      target: 'SpfModule',
      inverseSide: 'subgraph', // <-- matches relation prop on SpfModuleRow
    },
    vcpmInstances: {
      type: 'one-to-many',
      target: 'VcpmInstance',
      inverseSide: 'subgraph',
    },
    sgkvs: {
      type: 'one-to-many',
      target: 'Sgkv',
      inverseSide: 'subgraph',
    },
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {name: 'file_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE', // delete file => delete subgraphs
    },
  },
  indices: [
    {
      name: 'uq_subgraphs_name_file_system_id',
      columns: ['name', 'fileSystemId'],
      unique: true,
    },
    {
      name: 'uq_subgraphs_subgraph_id_file_system_id',
      columns: ['subgraphId', 'fileSystemId'],
      unique: true,
    },
  ],
});
