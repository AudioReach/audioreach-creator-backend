/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart, type EntityBaseRow} from '../entity-base.js';
import type {ProjectRow} from './project.schema.js';
import type {ContainerRow} from '../usecase-data/container/container.schema.js';
import type {SpfModuleRow} from '../usecase-data/module/spf-module.schema.js';
import type {SubgraphRow} from '../usecase-data/subgraph/subgraph.schema.js';
import {EntitySchema} from 'typeorm';

export interface ArcDbFileRow extends EntityBaseRow {
  description: string;
  metadata: string;
  fileName: string;
  isTarget: boolean;
  /**
   * Seed/counter for composite ID generation.
   * Initial value = files.system_id (seq = 0, no entities yet).
   * Incremented atomically by FileIdService.reserveBlock().
   */
  lastEntityId: number;

  // FK to project
  projectSystemId: number;
  project?: ProjectRow;

  // optional inverses (convenience for reads)
  subgraphs?: SubgraphRow[];
  containers?: ContainerRow[];
  modules?: SpfModuleRow[];
}

export const ArcDbFileSchema = new EntitySchema<ArcDbFileRow>({
  name: 'ArcDbFile',
  tableName: 'files',
  columns: {
    ...BaseColumnSchemaPart,
    description: {type: 'text'},
    metadata: {type: 'text'}, // or use `type: 'simple-json'` if you prefer object serialization
    fileName: {name: 'file_name', type: 'varchar', length: 250},
    isTarget: {type: 'integer'}, // SQLite stores boolean as 0/1
    lastEntityId: {
      name: 'last_entity_id',
      type: 'integer',
      nullable: false,
      default: 0,
    },

    projectSystemId: {name: 'project_system_id', type: 'integer'},
  },
  relations: {
    project: {
      type: 'many-to-one',
      target: 'Project',
      joinColumn: {name: 'project_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE', // delete project => delete files
    },

    // Optional read-only inverses (no save-cascade)
    subgraphs: {type: 'one-to-many', target: 'Subgraph', inverseSide: 'file'},
    containers: {type: 'one-to-many', target: 'Container', inverseSide: 'file'},
    modules: {type: 'one-to-many', target: 'SpfModule', inverseSide: 'file'},
  },
  indices: [
    {
      name: 'uk_files_project_filename',
      columns: ['projectSystemId', 'fileName'],
      unique: true,
    },
  ],
});
