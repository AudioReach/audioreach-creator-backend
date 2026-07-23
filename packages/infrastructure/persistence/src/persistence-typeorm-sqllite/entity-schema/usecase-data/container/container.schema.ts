/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
import type {SpfModuleRow} from '../module/spf-module.schema.js';
import type {ContainerPropertyDataRow} from './container-property-data.js';
import {EntitySchema} from 'typeorm';

/** Scalar columns only — no relations, no audit fields. Used by overlay fetchers. */
export interface ContainerBase {
  systemId: number;
  containerTypeSystemId: number;
  containerId: number;
  fileSystemId: number;
}

export interface ContainerRow extends EntityBaseRow, ContainerBase {
  // inverse relation for convenience (reads)
  modules?: SpfModuleRow[];
  containerPropertyData?: ContainerPropertyDataRow[];
  file?: ArcDbFileRow;
}

export const ContainerSchema = new EntitySchema<ContainerRow>({
  name: 'Container',
  tableName: 'containers',
  columns: {
    ...BaseColumnSchemaPart,
    containerTypeSystemId: {
      name: 'container_type_system_id',
      type: 'integer',
      nullable: true,
    },
    containerId: {name: 'container_id', type: 'integer'},
    fileSystemId: {name: 'file_system_id', type: 'integer'},
  },
  relations: {
    modules: {
      type: 'one-to-many',
      target: 'SpfModule',
      inverseSide: 'container',
    },
    containerPropertyData: {
      type: 'one-to-many',
      target: 'ContainerPropertyData',
      inverseSide: 'container',
    },
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {name: 'file_system_id', referencedColumnName: 'systemId'},
      onDelete: 'CASCADE', // delete file => delete containers
    },
  },
  indices: [
    {
      name: 'uq_containers_container_id_file_system_id',
      columns: ['containerId', 'fileSystemId'],
      unique: true,
    },
  ],
});
