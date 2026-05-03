/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {NodeRow} from '../node/node.schema.js';
import type {DataPortRow} from '../node/data-port-info.schema.js';
import type {UseCaseRow} from '../use-case.js';
import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
import {EntitySchema} from 'typeorm';

export interface DataLinkRow extends EntityBaseRow {
  sourceNodeSystemId: number;
  destinationNodeSystemId: number;
  sourcePortSystemId: number;
  destinationPortSystemId: number;
  isInterGraph: boolean;
  fileSystemId: number;

  sourceNode?: NodeRow;
  destinationNode?: NodeRow;
  sourcePort?: DataPortRow;
  destinationPort?: DataPortRow;
  useCases?: UseCaseRow[];
  file?: ArcDbFileRow;
}

export const DataLinkSchema = new EntitySchema<DataLinkRow>({
  name: 'DataLink',
  tableName: 'data_links',
  columns: {
    ...BaseColumnSchemaPart,
    sourceNodeSystemId: {
      type: 'integer',
      name: 'source_node_system_id',
    },
    destinationNodeSystemId: {
      type: 'integer',
      name: 'destination_node_system_id',
    },
    sourcePortSystemId: {
      type: 'integer',
      name: 'source_port_system_id',
    },
    destinationPortSystemId: {
      type: 'integer',
      name: 'destination_port_system_id',
    },
    isInterGraph: {
      type: 'integer', // SQLite stores boolean as 0/1
      name: 'is_inter_graph',
    },
    fileSystemId: {
      name: 'file_system_id',
      type: 'integer',
      nullable: false,
    },
  },
  relations: {
    sourceNode: {
      type: 'many-to-one',
      target: 'Node',
      joinColumn: {
        name: 'source_node_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    destinationNode: {
      type: 'many-to-one',
      target: 'Node',
      joinColumn: {
        name: 'destination_node_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    sourcePort: {
      type: 'many-to-one',
      target: 'DataPort',
      joinColumn: {
        name: 'source_port_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT',
    },
    destinationPort: {
      type: 'many-to-one',
      target: 'DataPort',
      joinColumn: {
        name: 'destination_port_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'RESTRICT',
    },
    file: {
      type: 'many-to-one',
      target: 'ArcDbFile',
      joinColumn: {
        name: 'file_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
    },
    useCases: {
      type: 'many-to-many',
      target: 'UseCase',
      inverseSide: 'dataLinks',
    },
  },
  indices: [
    {
      name: 'uk_data_link_ports',
      columns: ['sourcePortSystemId', 'destinationPortSystemId'],
      unique: true,
    },
  ],
});
