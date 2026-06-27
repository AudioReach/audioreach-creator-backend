/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EntitySchema} from 'typeorm';
import {BaseColumnSchemaPart} from '../../entity-base.js';
import type {EntityBaseRow} from '../../entity-base.js';
import type {NodeRow} from '../node/node.schema.js';
import type {DataPortRow} from '../node/data-port-info.schema.js';
import type {ArcDbFileRow} from '../../project-data/arc-db-file.schema.js';
import type {DataLinkRow} from './data-link.js';

export interface SubsystemDataLinkRow extends EntityBaseRow {
  sourceNodeSystemId: number;
  destinationNodeSystemId: number;
  sourcePortSystemId: number;
  destinationPortSystemId: number;
  dataLinkSystemId: number;
  fileSystemId: number;

  sourceNode?: NodeRow;
  destinationNode?: NodeRow;
  sourcePort?: DataPortRow;
  destinationPort?: DataPortRow;
  dataLink?: DataLinkRow;
  file?: ArcDbFileRow;
}

export const SubsystemDataLinkSchema = new EntitySchema<SubsystemDataLinkRow>({
  name: 'SubsystemDataLink',
  tableName: 'subsystem_data_links',
  columns: {
    ...BaseColumnSchemaPart,
    sourceNodeSystemId: {
      name: 'source_node_system_id',
      type: 'integer',
      nullable: false,
    },
    destinationNodeSystemId: {
      name: 'destination_node_system_id',
      type: 'integer',
      nullable: false,
    },
    sourcePortSystemId: {
      name: 'source_port_system_id',
      type: 'integer',
      nullable: false,
    },
    destinationPortSystemId: {
      name: 'destination_port_system_id',
      type: 'integer',
      nullable: false,
    },
    dataLinkSystemId: {
      name: 'data_link_system_id',
      type: 'integer',
      nullable: false,
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
    dataLink: {
      type: 'many-to-one',
      target: 'DataLink',
      joinColumn: {
        name: 'data_link_system_id',
        referencedColumnName: 'systemId',
      },
      onDelete: 'CASCADE',
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
  },
  indices: [
    {
      name: 'idx_sls_file',
      columns: ['fileSystemId'],
    },
    {
      name: 'idx_sls_data_link',
      columns: ['dataLinkSystemId'],
    },
    {
      name: 'idx_sls_src_port_file',
      columns: ['sourcePortSystemId', 'fileSystemId'],
    },
    {
      name: 'idx_sls_dst_port_file',
      columns: ['destinationPortSystemId', 'fileSystemId'],
    },
  ],
});
